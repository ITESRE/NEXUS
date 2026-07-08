import { Body, Controller, Get, Param, Patch, Req, UseGuards, } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SecurityService } from './security.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';


type RequestWithUser = {
  user: {
    userId: string;
    role: UserRole;
  };
};

@Controller('security')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SecurityController {
  constructor(
    private readonly securityService: SecurityService,
  ) {}

  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @Get('audit-logs')
  findAuditLogs() {
    return this.securityService.findAuditLogs();
  }

  @Roles(
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
)

  @Patch('users/:userId/status')
    updateUserStatus(
  @Param('userId') userId: string,
  @Body()
  updateUserStatusDto: UpdateUserStatusDto,
  @Req() req: RequestWithUser,
  ) {
  return this.securityService.updateUserStatus(
    userId,
    req.user,
    updateUserStatusDto,
  );
}

  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @Patch('users/:userId/role')
  updateUserRole(
    @Param('userId') userId: string,
    @Body()
    updateUserRoleDto: UpdateUserRoleDto,
    @Req() req: RequestWithUser,
  ) {
    return this.securityService.updateUserRole(
      userId,
      req.user,
      updateUserRoleDto,
    );
  }

}