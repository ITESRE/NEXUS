import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityAction, UserStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmailForAuth(loginDto.email);

    if (!user) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      loginDto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    authVersion: user.authVersion,
    };

    const secret =
      this.configService.getOrThrow<string>(
        'JWT_ACCESS_SECRET',
      );
    const expiresIn =
      this.configService.getOrThrow<string>(
        'JWT_ACCESS_EXPIRES_IN',
      );

    if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is not defined');
    }

    const jwtOptions: JwtSignOptions = {
    secret,
    expiresIn: expiresIn as JwtSignOptions['expiresIn'],
    };

    const accessToken = await this.jwtService.signAsync(payload, jwtOptions);
    const refreshToken = this.generateRefreshToken();

    const refreshTokenHash =
      this.hashRefreshToken(refreshToken);

    await this.prisma.refreshSession.create({
      data: {
        tokenHash: refreshTokenHash,
        userId: user.id,
        expiresAt: this.getRefreshTokenExpirationDate(),
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      },
    };
  }

private generateRefreshToken(): string {
  return randomBytes(64).toString('base64url');
}

private hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

private getRefreshTokenExpirationDate(): Date {
  const ttlDays =
    this.configService.getOrThrow<number>(
      'REFRESH_TOKEN_TTL_DAYS',
    );

  if (!Number.isInteger(ttlDays) || ttlDays <= 0) {
    throw new Error(
      'REFRESH_TOKEN_TTL_DAYS doit être un entier positif',
    );
  }

  const expiresAt = new Date();

  expiresAt.setUTCDate(
    expiresAt.getUTCDate() + ttlDays,
  );

  return expiresAt;
}

async refresh(refreshToken: string) {
  const tokenHash = this.hashRefreshToken(refreshToken);

  const session = await this.prisma.refreshSession.findUnique({
    where: {
      tokenHash,
    },
    include: {
      user: true,
    },
  });

  if (!session) {
    throw new UnauthorizedException(
      'Refresh token invalide ou expiré',
    );
  }

  if (session.revokedAt) {
    throw new UnauthorizedException(
      'Refresh token invalide ou expiré',
    );
  }

  if (session.expiresAt <= new Date()) {
    throw new UnauthorizedException(
      'Refresh token invalide ou expiré',
    );
  }

  if (session.user.status !== UserStatus.ACTIVE) {
    throw new UnauthorizedException(
      'Refresh token invalide ou expiré',
    );
  }

  const secret =
    this.configService.getOrThrow<string>(
      'JWT_ACCESS_SECRET',
    );
  const expiresIn =
    this.configService.getOrThrow<string>(
      'JWT_ACCESS_EXPIRES_IN',
    );

  if (!secret) {
    throw new Error(
      'JWT_ACCESS_SECRET is not defined',
    );
  }

  const payload = {
    sub: session.user.id,
    email: session.user.email,
    role: session.user.role,
    authVersion: session.user.authVersion,
  };

  const jwtOptions: JwtSignOptions = {
    secret,
    expiresIn:
      expiresIn as JwtSignOptions['expiresIn'],
  };

  const newAccessToken =
    await this.jwtService.signAsync(
      payload,
      jwtOptions,
    );

  const newRefreshToken =
    this.generateRefreshToken();

  const newRefreshTokenHash =
    this.hashRefreshToken(newRefreshToken);

  const now = new Date();

  await this.prisma.$transaction(async (tx) => {
    const revokedSession =
      await tx.refreshSession.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          revokedAt: now,
          lastUsedAt: now,
        },
      });

    if (revokedSession.count !== 1) {
      throw new UnauthorizedException(
        'Refresh token invalide ou expiré',
      );
    }

    await tx.refreshSession.create({
      data: {
        tokenHash: newRefreshTokenHash,
        userId: session.userId,
        expiresAt:
          this.getRefreshTokenExpirationDate(),
      },
    });
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    tokenType: 'Bearer',
    expiresIn,
  };
}

async logout(refreshToken: string) {
  const tokenHash = this.hashRefreshToken(refreshToken);
  const now = new Date();

  await this.prisma.refreshSession.updateMany({
    where: {
      tokenHash,
      revokedAt: null,
    },
    data: {
      revokedAt: now,
      lastUsedAt: now,
    },
  });

  return {
    message: 'Déconnexion effectuée',
  };
}

async logoutAll(userId: string) {
  const now = new Date();

  return this.prisma.$transaction(async (tx) => {
    const result = await tx.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        lastUsedAt: now,
      },
    });

    await tx.user.update({
      where: {
        id: userId,
      },
      data: {
        authVersion: {
          increment: 1,
        },
      },
    });

    return {
      message: 'Toutes les sessions ont été déconnectées',
      revokedSessions: result.count,
    };
  });
}

async logoutAllForUser(
  userId: string,
  actorId: string,
) {
  const now = new Date();

  return this.prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new NotFoundException(
        'Utilisateur introuvable',
      );
    }

    const result = await tx.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        lastUsedAt: now,
      },
    });

    await tx.user.update({
      where: {
        id: userId,
      },
      data: {
        authVersion: {
          increment: 1,
        },
      },
    });

    await tx.securityAuditLog.create({
      data: {
        action:
          SecurityAction.USER_SESSIONS_REVOKED,
        actorId,
        targetUserId: userId,
      },
    });

    return {
      message:
        'Toutes les sessions du compte ont été déconnectées',
      revokedSessions: result.count,
    };
  });
}

}