import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SocialAccessGuard } from '../social/social-access.guard';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  imports: [
    PrismaModule,
    ApplicationsModule,
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