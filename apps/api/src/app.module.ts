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
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [ ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: Joi.object({
    DATABASE_URL: Joi.string()
      .pattern(/^postgresql:\/\/.+/)
      .required(),

    JWT_ACCESS_SECRET: Joi.string()
      .min(32)
      .required(),

    JWT_ACCESS_EXPIRES_IN: Joi.string()
      .required(),

    REFRESH_TOKEN_TTL_DAYS: Joi.number()
      .integer()
      .positive()
      .required(),
  }),
}),
  ThrottlerModule.forRoot({
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