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
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, } from '@nestjs/throttler';

@Module({
  imports: [ ThrottlerModule.forRoot({
  throttlers: [
    {
      ttl: 60_000,
      limit: 120,
    },
  ],
}), PrismaModule, UsersModule, AuthModule, PostsModule, CommentsModule, ModerationModule, ProfileModule, SecurityModule,],
  controllers: [AppController],
  providers: [ {
  provide: APP_GUARD,
  useClass: ThrottlerGuard,
}, AppService],
})
export class AppModule {}