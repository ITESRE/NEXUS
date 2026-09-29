import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PlatformRole } from '@prisma/client';

type RequestWithUser = {
  params?: {
    id?: string;
  };
  user?: {
    userId: string;
    email: string;
    platformRole: PlatformRole;
  };
};

@Injectable()
export class CurrentUserOrAdminGuard
  implements CanActivate
{
  canActivate(
    context: ExecutionContext,
  ): boolean {
    const request =
      context.switchToHttp()
        .getRequest<RequestWithUser>();

    const currentUser =
      request.user;

    const targetUserId =
      request.params?.id;

    if (!currentUser) {
      throw new UnauthorizedException(
        'Utilisateur non authentifié',
      );
    }

    if (!targetUserId) {
      throw new BadRequestException(
        'Identifiant utilisateur manquant',
      );
    }

    const isPlatformAdmin =
      currentUser.platformRole ===
        PlatformRole.ADMIN ||
      currentUser.platformRole ===
        PlatformRole.SUPER_ADMIN;

    const isCurrentUser =
      currentUser.userId ===
      targetUserId;

    if (
      !isPlatformAdmin &&
      !isCurrentUser
    ) {
      throw new ForbiddenException(
        'Accès interdit',
      );
    }

    return true;
  }
}