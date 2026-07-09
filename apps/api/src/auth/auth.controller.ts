import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RolesGuard } from './roles.guard';
import { UserRole } from '@prisma/client';
import { Roles } from './roles.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({
  default: {
    limit: 10,
    ttl: 60_000,
  },
  })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Req() req: any) {
    return req.user;
  }

  @Post('refresh')
  @Throttle({
  default: {
    limit: 20,
    ttl: 60_000,
  },
  })
  refresh(
  @Body() refreshTokenDto: RefreshTokenDto,
  ) {
  return this.authService.refresh(
    refreshTokenDto.refreshToken,
  );
  }

  @Post('logout')
  logout(
  @Body() refreshTokenDto: RefreshTokenDto,
  ) {
  return this.authService.logout(
    refreshTokenDto.refreshToken,
  );
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  logoutAll(
  @Req() req: any,
  ) {
  return this.authService.logoutAll(
    req.user.userId,
  );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('users/:userId/logout-all')
  logoutAllForUser(
  @Param('userId') userId: string,
  @Req() req: any,
  ) {
  return this.authService.logoutAllForUser(
    userId,
    req.user.userId,
  );
  }

}