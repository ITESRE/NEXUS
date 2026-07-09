import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import helmet from 'helmet';

export function setupApp(
  app: INestApplication,
): void {
  app.use(helmet());

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}