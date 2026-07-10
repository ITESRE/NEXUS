import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';
import { ChangePasswordDto } from './dto/change-password.dto';


type RequestWithUser = {
  user: {
    userId: string;
  };
};

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  findMe(@Req() req: RequestWithUser) {
    return this.profileService.findMe(req.user.userId);
  }

  @Patch('me')
  updateMe(
    @Req() req: RequestWithUser,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.profileService.updateMe(
      req.user.userId,
      updateProfileDto,
    );
  }

  @Patch('me/password')
  changePassword(
    @Req() req: RequestWithUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.profileService.changePassword(
      req.user.userId,
      changePasswordDto,
    );
  }

}