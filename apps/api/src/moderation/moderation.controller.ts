import {
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SocialRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SocialAccessGuard } from '../social/social-access.guard';
import { SocialRoles } from '../social/social-roles.decorator';
import { SocialRolesGuard } from '../social/social-roles.guard';
import { ModerationService } from './moderation.service';

@Controller('moderation')
@UseGuards(
  JwtAuthGuard,
  SocialAccessGuard,
  SocialRolesGuard,
)
export class ModerationController {
  constructor(
    private readonly moderationService:
      ModerationService,
  ) {}

  @SocialRoles(
    SocialRole.MODERATOR,
    SocialRole.ADMIN,
  )
  @Get('posts/deleted')
  findDeletedPosts() {
    return this.moderationService
      .findDeletedPosts();
  }

  @SocialRoles(
    SocialRole.MODERATOR,
    SocialRole.ADMIN,
  )
  @Get('comments/deleted')
  findDeletedComments() {
    return this.moderationService
      .findDeletedComments();
  }

  @SocialRoles(
    SocialRole.MODERATOR,
    SocialRole.ADMIN,
  )
  @Patch('posts/:id/restore')
  restorePost(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.moderationService
      .restorePost(
        id,
        req.user,
      );
  }

  @SocialRoles(
    SocialRole.MODERATOR,
    SocialRole.ADMIN,
  )
  @Patch('comments/:id/restore')
  restoreComment(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.moderationService
      .restoreComment(
        id,
        req.user,
      );
  }

  @SocialRoles(
    SocialRole.ADMIN,
  )
  @Get('logs')
  findLogs() {
    return this.moderationService
      .findLogs();
  }
}