import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SocialAccessGuard } from '../social/social-access.guard';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [
    CommentsController,
  ],
  providers: [
    CommentsService,
    SocialAccessGuard,
  ],
})
export class CommentsModule {}