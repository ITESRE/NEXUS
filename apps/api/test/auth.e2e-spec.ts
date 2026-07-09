import { INestApplication } from '@nestjs/common';
import {
  Test,
  TestingModule,
} from '@nestjs/testing';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from '@jest/globals';
import request from 'supertest';
import { App } from 'supertest/types';
import * as argon2 from 'argon2';

import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

const TEST_EMAIL = 'e2e-user@nexus.local';

const TEST_PASSWORD = 'E2ePassword123!';

describe('Authentification (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule =
      await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

    app =
      moduleFixture.createNestApplication();

    setupApp(app);

    await app.init();

    prisma = app.get(PrismaService);

    await prisma.user.deleteMany({
      where: {
        email: TEST_EMAIL,
      },
    });

    const passwordHash =
      await argon2.hash(TEST_PASSWORD, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });

    await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        firstName: 'E2E',
        lastName: 'User',
      },
    });
  });

  it('refuse un mauvais mot de passe', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: TEST_EMAIL,
        password: 'MauvaisMotDePasse123!',
      })
      .expect(401);
  });

  it('connecte un utilisateur valide', async () => {
    const response =
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        });

    expect([200, 201]).toContain(
      response.status,
    );

    expect(
      response.body.accessToken,
    ).toBeDefined();

    expect(
      response.body.refreshToken,
    ).toBeDefined();

    expect(
      response.body.user.email,
    ).toBe(TEST_EMAIL);

    accessToken =
      response.body.accessToken;
  });

  it('retourne le profil connecté avec /auth/me', async () => {
    const response =
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set(
          'Authorization',
          `Bearer ${accessToken}`,
        )
        .expect(200);

    expect(response.body.email)
      .toBe(TEST_EMAIL);

    expect(response.body.role)
      .toBe('USER');

    expect(response.body.status)
      .toBe('ACTIVE');

    expect(
      response.body.passwordHash,
    ).toBeUndefined();
  });

  it('fait tourner le refresh token et refuse sa réutilisation', async () => {
    const loginResponse =
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        });

    expect([200, 201]).toContain(
      loginResponse.status,
    );

    const refreshToken1: string =
      loginResponse.body.refreshToken;

    expect(refreshToken1)
      .toBeDefined();

    const refreshResponse =
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({
          refreshToken: refreshToken1,
        });

    expect([200, 201]).toContain(
      refreshResponse.status,
    );

    const accessToken2: string =
      refreshResponse.body.accessToken;

    const refreshToken2: string =
      refreshResponse.body.refreshToken;

    expect(accessToken2)
      .toBeDefined();

    expect(refreshToken2)
      .toBeDefined();

    expect(refreshToken2)
      .not.toBe(refreshToken1);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(
        'Authorization',
        `Bearer ${accessToken2}`,
      )
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({
        refreshToken: refreshToken1,
      })
      .expect(401);
  });

  it('refuse un faux refresh token', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({
        refreshToken:
          'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      })
      .expect(401);
  });

  it('refuse un body vide sur le refresh', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({})
      .expect(400);
  });

  it('invalide les anciens access et refresh tokens apres logout-all', async () => {
    const loginResponse =
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        });

    expect([200, 201]).toContain(
      loginResponse.status,
    );

    const oldAccessToken: string =
      loginResponse.body.accessToken;

    const oldRefreshToken: string =
      loginResponse.body.refreshToken;

    expect(oldAccessToken)
      .toBeDefined();

    expect(oldRefreshToken)
      .toBeDefined();

    const userBefore =
      await prisma.user.findUniqueOrThrow({
        where: {
          email: TEST_EMAIL,
        },
        select: {
          authVersion: true,
        },
      });

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(
        'Authorization',
        `Bearer ${oldAccessToken}`,
      )
      .expect(200);

    const logoutAllResponse =
      await request(app.getHttpServer())
        .post('/api/auth/logout-all')
        .set(
          'Authorization',
          `Bearer ${oldAccessToken}`,
        );

    expect([200, 201]).toContain(
      logoutAllResponse.status,
    );

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({
        refreshToken: oldRefreshToken,
      })
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(
        'Authorization',
        `Bearer ${oldAccessToken}`,
      )
      .expect(401);

    const userAfter =
      await prisma.user.findUniqueOrThrow({
        where: {
          email: TEST_EMAIL,
        },
        select: {
          authVersion: true,
        },
      });

    expect(
      userAfter.authVersion,
    ).toBe(
      userBefore.authVersion + 1,
    );

    const newLoginResponse =
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        });

    expect([200, 201]).toContain(
      newLoginResponse.status,
    );

    expect(
      newLoginResponse.body.accessToken,
    ).toBeDefined();

    expect(
      newLoginResponse.body.refreshToken,
    ).toBeDefined();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: TEST_EMAIL,
      },
    });

    await app.close();
  });
});