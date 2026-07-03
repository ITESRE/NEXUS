import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

function getJwtAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET manquant dans le fichier .env');
  }

  return secret;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtAccessSecret(),
    });
  }

  validate(payload: any) {
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}