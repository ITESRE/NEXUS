import {
  INestApplication,
} from '@nestjs/common';
import {
  Test,
  TestingModule,
} from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  afterAll,
  beforeAll,
  describe,
  it,
} from '@jest/globals';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';

describe('Application (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule =
      await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

    app =
      moduleFixture.createNestApplication();

    setupApp(app);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health retourne 200', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
  });
});