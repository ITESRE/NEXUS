import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationAccessService } from './application-access.service';

@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [
    ApplicationsController,
  ],
  providers: [
    ApplicationAccessService,
  ],
  exports: [
    ApplicationAccessService,
  ],
})
export class ApplicationsModule {}