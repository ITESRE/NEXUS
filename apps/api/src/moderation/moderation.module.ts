import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SocialAccessGuard } from '../social/social-access.guard';
import { SocialRolesGuard } from '../social/social-roles.guard';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [
    ModerationController,
  ],
  providers: [
    ModerationService,
    SocialAccessGuard,
    SocialRolesGuard,
  ],
})
export class ModerationModule {}