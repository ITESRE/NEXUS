import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  PlatformRole,
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  PlatformRoles,
} from '../auth/platform-roles.decorator';
import {
  PlatformRolesGuard,
} from '../auth/platform-roles.guard';
import { ApplicationAccessService } from './application-access.service';
import { ApplicationAdminService } from './application-admin.service';

type AuthenticatedRequest = {
  user: {
    userId: string;
    platformRole: PlatformRole;
  };
};

@Controller('applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(
    private readonly applicationAccessService:
      ApplicationAccessService,

    private readonly applicationAdminService:
      ApplicationAdminService,
  ) {}

  /*
   * HUB utilisateur :
   * retourne uniquement les applications
   * actives auxquelles il a acces.
   */
  @Get('me')
  async findMine(
    @Req()
    request: AuthenticatedRequest,
  ) {
    const applications =
      await this.applicationAccessService
        .findEnabledApplicationsForUser(
          request.user.userId,
        );

    return {
      applications,
    };
  }

  /*
   * Catalogue CORE complet.
   * ADMIN et SUPER_ADMIN peuvent le consulter.
   */
  @PlatformRoles(
    PlatformRole.ADMIN,
    PlatformRole.SUPER_ADMIN,
  )
  @UseGuards(PlatformRolesGuard)
  @Get()
  async findAll() {
    const applications =
      await this.applicationAdminService
        .findAllApplications();

    return {
      applications,
    };
  }

  /*
   * Vue des droits d'un utilisateur.
   *
   * Les applications desactivees restent visibles
   * afin que le back-office distingue :
   * - droit individuel ;
   * - kill-switch global.
   */
  @PlatformRoles(
    PlatformRole.ADMIN,
    PlatformRole.SUPER_ADMIN,
  )
  @UseGuards(PlatformRolesGuard)
  @Get('users/:userId')
  findForUser(
    @Param(
      'userId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    userId: string,
  ) {
    return this.applicationAdminService
      .findApplicationsForUser(
        userId,
      );
  }

  /*
   * Attribution :
   * SUPER_ADMIN uniquement.
   */
  @PlatformRoles(
    PlatformRole.SUPER_ADMIN,
  )
  @UseGuards(PlatformRolesGuard)
  @Put(
    'users/:userId/:applicationKey',
  )
  grantAccess(
    @Param(
      'userId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    userId: string,

    @Param('applicationKey')
    applicationKey: string,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.applicationAdminService
      .grantAccess(
        userId,
        applicationKey,
        request.user,
      );
  }

  /*
   * Revocation :
   * SUPER_ADMIN uniquement.
   */
  @PlatformRoles(
    PlatformRole.SUPER_ADMIN,
  )
  @UseGuards(PlatformRolesGuard)
  @Delete(
    'users/:userId/:applicationKey',
  )
  revokeAccess(
    @Param(
      'userId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    userId: string,

    @Param('applicationKey')
    applicationKey: string,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.applicationAdminService
      .revokeAccess(
        userId,
        applicationKey,
        request.user,
      );
  }
}