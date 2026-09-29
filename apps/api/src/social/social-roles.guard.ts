import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SocialRole } from '@prisma/client';
import { SOCIAL_ROLES_KEY } from './social-roles.decorator';

type SocialAuthenticatedRequest = {
  user?: {
    userId: string;
    socialRole?: SocialRole;
  };
};

@Injectable()
export class SocialRolesGuard
  implements CanActivate
{
  constructor(
    private readonly reflector: Reflector,
  ) {}

  canActivate(
    context: ExecutionContext,
  ): boolean {
    const requiredRoles =
      this.reflector
        .getAllAndOverride<SocialRole[]>(
          SOCIAL_ROLES_KEY,
          [
            context.getHandler(),
            context.getClass(),
          ],
        );

    if (
      !requiredRoles ||
      requiredRoles.length === 0
    ) {
      return true;
    }

    const request =
      context
        .switchToHttp()
        .getRequest<SocialAuthenticatedRequest>();

    const socialRole =
      request.user?.socialRole;

    if (!socialRole) {
      throw new ForbiddenException(
        'Accès NEXUS Social interdit',
      );
    }

    if (
      !requiredRoles.includes(
        socialRole,
      )
    ) {
      throw new ForbiddenException(
        'Accès interdit',
      );
    }

    return true;
  }
}