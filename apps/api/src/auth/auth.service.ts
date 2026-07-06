import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

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

}