import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PlatformRole } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  PlatformRoles,
} from './platform-roles.decorator';
import {
  PlatformRolesGuard,
} from './platform-roles.guard';
import {
  PasswordResetRequestDto,
} from './dto/password-reset-request.dto';
import {
  PasswordResetConfirmDto,
} from './dto/password-reset-confirm.dto';

type RequestWithPlatformUser = {
  user: {
    userId: string;
    platformRole: PlatformRole;
  };
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService:
      AuthService,
  ) {}

  @Post('login')
  @Throttle({
    default: {
      limit: 10,
      ttl: 60_000,
    },
  })
  login(
    @Body()
    loginDto: LoginDto,
  ) {
    return this.authService.login(
      loginDto,
    );
  }

  @Post('password-reset/request')
  @HttpCode(200)
  @Throttle({
    default: {
      limit: 5,
      ttl: 15 * 60_000,
    },
  })
  requestPasswordReset(
    @Body()
    passwordResetRequestDto:
      PasswordResetRequestDto,
  ) {
    return this.authService
      .requestPasswordReset(
        passwordResetRequestDto.email,
      );
  }

  @Post('password-reset/confirm')
  @HttpCode(200)
  @Throttle({
    default: {
      limit: 10,
      ttl: 15 * 60_000,
    },
  })
  confirmPasswordReset(
    @Body()
    passwordResetConfirmDto:
      PasswordResetConfirmDto,
  ) {
    return this.authService
      .confirmPasswordReset(
        passwordResetConfirmDto.token,
        passwordResetConfirmDto.newPassword,
      );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(
    @Req() req: any,
  ) {
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
    @Body()
    refreshTokenDto:
      RefreshTokenDto,
  ) {
    return this.authService.refresh(
      refreshTokenDto.refreshToken,
    );
  }

  @Post('logout')
  logout(
    @Body()
    refreshTokenDto:
      RefreshTokenDto,
  ) {
    return this.authService.logout(
      refreshTokenDto.refreshToken,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  getActiveSessions(
    @Req() req: any,
  ) {
    return this.authService
      .getActiveSessions(
        req.user.userId,
      );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:sessionId')
  revokeSession(
    @Param(
      'sessionId',
      new ParseUUIDPipe(),
    )
    sessionId: string,
    @Req() req: any,
  ) {
    return this.authService
      .revokeSession(
        req.user.userId,
        sessionId,
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

  @UseGuards(
    JwtAuthGuard,
    PlatformRolesGuard,
  )
  @PlatformRoles(
    PlatformRole.ADMIN,
    PlatformRole.SUPER_ADMIN,
  )
  @Post('users/:userId/logout-all')
  logoutAllForUser(
    @Param('userId')
    userId: string,
    @Req()
    req: RequestWithPlatformUser,
  ) {
    return this.authService
      .logoutAllForUser(
        userId,
        req.user,
      );
  }
}