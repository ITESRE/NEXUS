import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SecurityService } from './security.service';

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
}