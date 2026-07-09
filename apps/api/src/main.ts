import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { setupApp } from './app.setup';

async function bootstrap() {
  const app =
    await NestFactory.create(AppModule);

  const configService =
    app.get(ConfigService);

  setupApp(app);

  await app.listen(
    configService.get<number>('PORT', 4000),
  );
}

bootstrap();