import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApplicationAccessService } from './application-access.service';

type AuthenticatedRequest = {
  user: {
    userId: string;
  };
};

@Controller('applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(
    private readonly applicationAccessService:
      ApplicationAccessService,
  ) {}

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
}