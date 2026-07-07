import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PostsModule } from './posts/posts.module';
import { CommentsModule } from './comments/comments.module';
import { ModerationModule } from './moderation/moderation.module';
import { ProfileModule } from './profile/profile.module';
import { SecurityModule } from './security/security.module';

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, PostsModule, CommentsModule, ModerationModule, ProfileModule, SecurityModule,],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}