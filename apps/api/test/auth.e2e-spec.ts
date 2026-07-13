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
import { hashPassword } from '../src/security/password.security';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { createHash } from 'crypto';

const TEST_EMAIL = 'e2e-user@nexus.local';

const OTHER_TEST_EMAIL =
  'e2e-other-user@nexus.local';

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
        email: {
          in: [
            TEST_EMAIL,
            OTHER_TEST_EMAIL,
          ],
        },
      },
    });

    const passwordHash =
      await hashPassword(TEST_PASSWORD);

    await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        firstName: 'E2E',
        lastName: 'User',
      },
    });
    await prisma.user.create({
      data: {
        email: OTHER_TEST_EMAIL,
        passwordHash,
        firstName: 'E2E',
        lastName: 'Other',
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

  it('refuse la liste des sessions sans JWT', async () => {
  await request(app.getHttpServer())
    .get('/api/auth/sessions')
    .expect(401);
});

it('liste les sessions actives sans exposer tokenHash', async () => {
  const response =
    await request(app.getHttpServer())
      .get('/api/auth/sessions')
      .set(
        'Authorization',
        `Bearer ${accessToken}`,
      )
      .expect(200);

  expect(
    Array.isArray(response.body),
  ).toBe(true);

  expect(
    response.body.length,
  ).toBeGreaterThan(0);

  for (const session of response.body) {
    expect(session.id).toBeDefined();
    expect(session.expiresAt).toBeDefined();
    expect(session.createdAt).toBeDefined();

    expect(
      session.tokenHash,
    ).toBeUndefined();

    expect(
      session.userId,
    ).toBeUndefined();

    expect(
      session.revokedAt,
    ).toBeUndefined();
  }
});

it('refuse un sessionId qui ne respecte pas le format UUID', async () => {
  await request(app.getHttpServer())
    .delete(
      '/api/auth/sessions/pas-un-uuid',
    )
    .set(
      'Authorization',
      `Bearer ${accessToken}`,
    )
    .expect(400);
});

it('revoque une session personnelle sans invalider son access token', async () => {
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

  const sessionAccessToken: string =
    loginResponse.body.accessToken;

  const sessionRefreshToken: string =
    loginResponse.body.refreshToken;

  const tokenHash = createHash('sha256')
    .update(sessionRefreshToken)
    .digest('hex');

  const session =
    await prisma.refreshSession.findUniqueOrThrow({
      where: {
        tokenHash,
      },
      select: {
        id: true,
      },
    });

  const revokeResponse =
    await request(app.getHttpServer())
      .delete(
        `/api/auth/sessions/${session.id}`,
      )
      .set(
        'Authorization',
        `Bearer ${sessionAccessToken}`,
      )
      .expect(200);

  expect(
    revokeResponse.body.message,
  ).toBe('Session déconnectée');

  await request(app.getHttpServer())
    .post('/api/auth/refresh')
    .send({
      refreshToken: sessionRefreshToken,
    })
    .expect(401);

  await request(app.getHttpServer())
    .get('/api/auth/me')
    .set(
      'Authorization',
      `Bearer ${sessionAccessToken}`,
    )
    .expect(200);

  await request(app.getHttpServer())
    .delete(
      `/api/auth/sessions/${session.id}`,
    )
    .set(
      'Authorization',
      `Bearer ${sessionAccessToken}`,
    )
    .expect(404);
});

it("interdit de revoquer la session d'un autre utilisateur", async () => {
  const otherLoginResponse =
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: OTHER_TEST_EMAIL,
        password: TEST_PASSWORD,
      });

  expect([200, 201]).toContain(
    otherLoginResponse.status,
  );

  const otherRefreshToken: string =
    otherLoginResponse.body.refreshToken;

  const otherTokenHash = createHash('sha256')
    .update(otherRefreshToken)
    .digest('hex');

  const otherSession =
    await prisma.refreshSession.findUniqueOrThrow({
      where: {
        tokenHash: otherTokenHash,
      },
      select: {
        id: true,
      },
    });

  await request(app.getHttpServer())
    .delete(
      `/api/auth/sessions/${otherSession.id}`,
    )
    .set(
      'Authorization',
      `Bearer ${accessToken}`,
    )
    .expect(404);

  const refreshResponse =
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({
        refreshToken: otherRefreshToken,
      });

  expect([200, 201]).toContain(
    refreshResponse.status,
  );

  expect(
    refreshResponse.body.accessToken,
  ).toBeDefined();

  expect(
    refreshResponse.body.refreshToken,
  ).toBeDefined();
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
        email: {
          in: [
            TEST_EMAIL,
            OTHER_TEST_EMAIL,
          ],
        },
      },
    });

    await app.close();
  });
});