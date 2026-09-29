import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PlatformRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  PlatformRoles,
} from '../auth/platform-roles.decorator';
import {
  PlatformRolesGuard,
} from '../auth/platform-roles.guard';
import { SecurityService } from './security.service';
import {
  UpdateUserStatusDto,
} from './dto/update-user-status.dto';
import {
  UpdateUserPlatformRoleDto,
} from './dto/update-user-platform-role.dto';

type RequestWithUser = {
  user: {
    userId: string;
    platformRole: PlatformRole;
  };
};

@Controller('security')
@UseGuards(
  JwtAuthGuard,
  PlatformRolesGuard,
)
export class SecurityController {
  constructor(
    private readonly securityService:
      SecurityService,
  ) {}

  @PlatformRoles(
    PlatformRole.ADMIN,
    PlatformRole.SUPER_ADMIN,
  )
  @Get('audit-logs')
  findAuditLogs() {
    return this.securityService
      .findAuditLogs();
  }

  @PlatformRoles(
    PlatformRole.ADMIN,
    PlatformRole.SUPER_ADMIN,
  )
  @Patch('users/:userId/status')
  updateUserStatus(
    @Param('userId')
    userId: string,
    @Body()
    updateUserStatusDto:
      UpdateUserStatusDto,
    @Req()
    req: RequestWithUser,
  ) {
    return this.securityService
      .updateUserStatus(
        userId,
        req.user,
        updateUserStatusDto,
      );
  }

  /*
   * Seul SUPER_ADMIN peut
   * promouvoir/dégrader un rôle
   * plateforme.
   */
  @PlatformRoles(
    PlatformRole.SUPER_ADMIN,
  )
  @Patch(
    'users/:userId/platform-role',
  )
  updateUserPlatformRole(
    @Param('userId')
    userId: string,
    @Body()
    updateUserPlatformRoleDto:
      UpdateUserPlatformRoleDto,
    @Req()
    req: RequestWithUser,
  ) {
    return this.securityService
      .updateUserPlatformRole(
        userId,
        req.user,
        updateUserPlatformRoleDto,
      );
  }
}