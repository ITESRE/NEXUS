import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformRole } from '@prisma/client';
import {
  PLATFORM_ROLES_KEY,
} from './platform-roles.decorator';

type AuthenticatedRequest = {
  user?: {
    userId: string;
    email: string;
    platformRole: PlatformRole;
  };
};

@Injectable()
export class PlatformRolesGuard
  implements CanActivate
{
  constructor(
    private readonly reflector: Reflector,
  ) {}

  canActivate(
    context: ExecutionContext,
  ): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<
        PlatformRole[]
      >(
        PLATFORM_ROLES_KEY,
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
      context.switchToHttp()
        .getRequest<AuthenticatedRequest>();

    const user =
      request.user;

    if (!user) {
      return false;
    }

    if (
      !requiredRoles.includes(
        user.platformRole,
      )
    ) {
      throw new ForbiddenException(
        'Accès interdit',
      );
    }

    return true;
  }
}