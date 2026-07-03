import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ModerationService } from './moderation.service';

@Controller('moderation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('posts/deleted')
  findDeletedPosts() {
    return this.moderationService.findDeletedPosts();
  }

  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('comments/deleted')
  findDeletedComments() {
    return this.moderationService.findDeletedComments();
  }

    @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Patch('posts/:id/restore')
  restorePost(@Param('id') id: string) {
    return this.moderationService.restorePost(id);
  }

  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Patch('comments/:id/restore')
  restoreComment(@Param('id') id: string) {
    return this.moderationService.restoreComment(id);
  }

}