import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import {
  PlatformRole,
  UserRole,
  UserStatus,
} from '@prisma/client';
import {
  ExtractJwt,
  Strategy,
} from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';

type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  platformRole?: PlatformRole;
  authVersion: number;
};

@Injectable()
export class JwtStrategy
  extends PassportStrategy(Strategy)
{
  constructor(
    private readonly usersService:
      UsersService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest:
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.getOrThrow<string>(
          'JWT_ACCESS_SECRET',
        ),
    });
  }

  async validate(
    payload: JwtPayload,
  ) {
    if (!payload.sub) {
      throw new UnauthorizedException(
        'Token invalide',
      );
    }

    if (
      !Number.isInteger(
        payload.authVersion,
      )
    ) {
      throw new UnauthorizedException();
    }

    const user =
      await this.usersService
        .findByIdForAuth(
          payload.sub,
        );

    if (!user) {
      throw new UnauthorizedException(
        'Token invalide',
      );
    }

    if (
      user.status !==
      UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException(
        'Compte désactivé',
      );
    }

    if (
      user.authVersion !==
      payload.authVersion
    ) {
      throw new UnauthorizedException();
    }

    /*
     * IMPORTANT :
     * on ne fait jamais confiance aux rôles
     * contenus dans le JWT.
     *
     * Les rôles sont relus depuis la BDD
     * à chaque requête authentifiée.
     */
    return {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,

      // Legacy, conservé temporairement
      // pour compatibilité de contrat.
      role: user.role,

      // Autorité CORE réelle.
      platformRole:
        user.platformRole,

      status: user.status,
    };
  }
}