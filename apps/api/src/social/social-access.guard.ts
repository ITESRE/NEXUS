import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { SocialRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type SocialAuthenticatedRequest = {
  user?: {
    userId: string;
    socialRole?: SocialRole;
  };
};

@Injectable()
export class SocialAccessGuard
  implements CanActivate
{
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request =
      context
        .switchToHttp()
        .getRequest<SocialAuthenticatedRequest>();

    const user = request.user;

    if (!user?.userId) {
      throw new ForbiddenException(
        'Accès NEXUS Social interdit',
      );
    }

    const socialProfile =
      await this.prisma.socialProfile.findUnique({
        where: {
          userId: user.userId,
        },
        select: {
          role: true,
        },
      });

    if (!socialProfile) {
      throw new ForbiddenException(
        'Accès NEXUS Social interdit',
      );
    }

    user.socialRole =
      socialProfile.role;

    return true;
  }
}