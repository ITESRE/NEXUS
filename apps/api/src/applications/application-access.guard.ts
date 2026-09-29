import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApplicationAccessService } from './application-access.service';
import { APPLICATION_ACCESS_KEY } from './application-access.decorator';

type ApplicationAuthenticatedRequest = {
  user?: {
    userId: string;
  };
};

@Injectable()
export class ApplicationAccessGuard
  implements CanActivate
{
  constructor(
    private readonly reflector:
      Reflector,
    private readonly applicationAccessService:
      ApplicationAccessService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const applicationKey =
      this.reflector
        .getAllAndOverride<string>(
          APPLICATION_ACCESS_KEY,
          [
            context.getHandler(),
            context.getClass(),
          ],
        );

    /*
     * Le guard peut etre declare dans une chaine
     * partagee sans forcer un acces particulier.
     *
     * L'absence de @RequireApplication signifie
     * simplement qu'aucune application precise
     * n'est exigee par cette route.
     */
    if (!applicationKey) {
      return true;
    }

    const request =
      context
        .switchToHttp()
        .getRequest<
          ApplicationAuthenticatedRequest
        >();

    const userId =
      request.user?.userId;

    if (!userId) {
      throw new ForbiddenException(
        'Acces application interdit',
      );
    }

    const hasAccess =
      await this.applicationAccessService
        .hasAccess(
          userId,
          applicationKey,
        );

    if (!hasAccess) {
      throw new ForbiddenException(
        'Acces application interdit',
      );
    }

    return true;
  }
}