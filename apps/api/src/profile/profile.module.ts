import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { EmailChangeController } from './email-change.controller';
import { EmailChangeTokenCleanupService } from './email-change-token-cleanup.service';

@Module({
  imports: [
    PrismaModule,
    MailModule,
  ],
  controllers: [
    ProfileController,
    EmailChangeController,
  ],
  providers: [
    ProfileService,
    EmailChangeTokenCleanupService,
  ],
})
export class ProfileModule {}