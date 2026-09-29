import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PlatformRole } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  PlatformRoles,
} from '../auth/platform-roles.decorator';
import {
  PlatformRolesGuard,
} from '../auth/platform-roles.guard';
import {
  CurrentUserOrAdminGuard,
} from '../auth/current-user-or-admin.guard';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService:
      UsersService,
  ) {}

  @UseGuards(
    JwtAuthGuard,
    PlatformRolesGuard,
  )
  @PlatformRoles(
    PlatformRole.ADMIN,
    PlatformRole.SUPER_ADMIN,
  )
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @UseGuards(
    JwtAuthGuard,
    CurrentUserOrAdminGuard,
  )
  @Get(':id')
  findOne(
    @Param('id') id: string,
  ) {
    return this.usersService.findOne(
      id,
    );
  }

  @Post()
  create(
    @Body()
    createUserDto:
      CreateUserDto,
  ) {
    return this.usersService.create(
      createUserDto,
    );
  }
}