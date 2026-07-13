import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmailChangeRequestDto } from './dto/email-change-request.dto';
import { EmailChangeConfirmDto } from './dto/email-change-confirm.dto';
import { ProfileService } from './profile.service';

type RequestWithUser = {
  user: {
    userId: string;
  };
};

@Controller('profile/email-change')
export class EmailChangeController {
  constructor(
    private readonly profileService: ProfileService,
  ) {}

  @Post('request')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({
    default: {
      limit: 5,
      ttl: 15 * 60_000,
    },
  })
  requestEmailChange(
    @Req() req: RequestWithUser,
    @Body()
    emailChangeRequestDto:
      EmailChangeRequestDto,
  ) {
    return this.profileService.requestEmailChange(
      req.user.userId,
      emailChangeRequestDto,
    );
  }

  @Post('confirm')
    @HttpCode(200)
    @Throttle({
    default: {
        limit: 10,
        ttl: 15 * 60_000,
    },
    })
    confirmEmailChange(
    @Body()
    emailChangeConfirmDto:
        EmailChangeConfirmDto,
    ) {
    return this.profileService.confirmEmailChange(
        emailChangeConfirmDto.token,
    );
    }

}