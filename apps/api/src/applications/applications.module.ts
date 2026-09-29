import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationAccessService } from './application-access.service';
import { ApplicationAccessGuard } from './application-access.guard';
import { ApplicationAdminService } from './application-admin.service';

@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [
    ApplicationsController,
  ],
  providers: [
    ApplicationAccessService,
    ApplicationAccessGuard,
    ApplicationAdminService,
  ],
  exports: [
    ApplicationAccessService,
    ApplicationAccessGuard,
  ],
})
export class ApplicationsModule {}