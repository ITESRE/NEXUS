import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatus } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
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
    };

    const secret = process.env.JWT_ACCESS_SECRET;
    const expiresIn = process.env.JWT_ACCESS_EXPIRES_IN ?? '15m';

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
  const ttlDays = Number(
    process.env.REFRESH_TOKEN_TTL_DAYS ?? '30',
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

  const secret = process.env.JWT_ACCESS_SECRET;
  const expiresIn =
    process.env.JWT_ACCESS_EXPIRES_IN ?? '15m';

  if (!secret) {
    throw new Error(
      'JWT_ACCESS_SECRET is not defined',
    );
  }

  const payload = {
    sub: session.user.id,
    email: session.user.email,
    role: session.user.role,
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

  const result = await this.prisma.refreshSession.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: now,
      lastUsedAt: now,
    },
  });

  return {
    message: 'Toutes les sessions ont été déconnectées',
    revokedSessions: result.count,
  };
}

async logoutAllForUser(userId: string) {
  const user = await this.prisma.user.findUnique({
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

  return this.logoutAll(userId);
}

}