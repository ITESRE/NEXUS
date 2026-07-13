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
import { SecurityAction } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

const TEST_EMAIL =
  'e2e-profile-user@nexus.local';

const INITIAL_PASSWORD =
  'E2eInitialPassword123!';

const NEW_PASSWORD =
  'E2eNewPassword456!';

describe('Profil utilisateur (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userId: string;

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

const existingUser =
  await prisma.user.findUnique({
    where: {
      email: TEST_EMAIL,
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    await prisma.securityAuditLog.deleteMany({
      where: {
        OR: [
          {
            actorId: existingUser.id,
          },
          {
            targetUserId: existingUser.id,
          },
        ],
      },
    });

    await prisma.refreshSession.deleteMany({
      where: {
        userId: existingUser.id,
      },
    });

    await prisma.user.delete({
      where: {
        id: existingUser.id,
      },
    });
  }
    
    const passwordHash = await hashPassword(INITIAL_PASSWORD);

    const user =
      await prisma.user.create({
        data: {
          email: TEST_EMAIL,
          passwordHash,
          firstName: 'E2E',
          lastName: 'ProfileUser',
          role: 'USER',
          status: 'ACTIVE',
        },
      });

    userId = user.id;
  });

  it('change le mot de passe et invalide les anciennes sessions', async () => {
    // Login avec le mot de passe initial

    const loginResponse =
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: TEST_EMAIL,
          password: INITIAL_PASSWORD,
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
          id: userId,
        },
        select: {
          authVersion: true,
        },
      });

    // Sans token → 401

    await request(app.getHttpServer())
      .patch('/api/profile/me/password')
      .send({
        currentPassword:
          INITIAL_PASSWORD,
        newPassword:
          NEW_PASSWORD,
      })
      .expect(401);

    // Mauvais mot de passe actuel → 401

    await request(app.getHttpServer())
      .patch('/api/profile/me/password')
      .set(
        'Authorization',
        `Bearer ${oldAccessToken}`,
      )
      .send({
        currentPassword:
          'WrongPassword123!',
        newPassword:
          NEW_PASSWORD,
      })
      .expect(401);

    // Nouveau mot de passe faible → 400

    await request(app.getHttpServer())
      .patch('/api/profile/me/password')
      .set(
        'Authorization',
        `Bearer ${oldAccessToken}`,
      )
      .send({
        currentPassword:
          INITIAL_PASSWORD,
        newPassword:
          'motdepasse',
      })
      .expect(400);

    // Nouveau mot de passe identique → 400

    await request(app.getHttpServer())
      .patch('/api/profile/me/password')
      .set(
        'Authorization',
        `Bearer ${oldAccessToken}`,
      )
      .send({
        currentPassword:
          INITIAL_PASSWORD,
        newPassword:
          INITIAL_PASSWORD,
      })
      .expect(400);

      const passwordAuditCountBefore =
  await prisma.securityAuditLog.count({
    where: {
      action:
        SecurityAction.USER_PASSWORD_CHANGED,
      actorId: userId,
      targetUserId: userId,
    },
  });

    // Changement valide

    const changeResponse =
      await request(app.getHttpServer())
        .patch('/api/profile/me/password')
        .set(
          'Authorization',
          `Bearer ${oldAccessToken}`,
        )
        .send({
          currentPassword:
            INITIAL_PASSWORD,
          newPassword:
            NEW_PASSWORD,
        })
        .expect(200);

    expect(changeResponse.body.message)
      .toBe(
        'Mot de passe modifié avec succès',
      );

    // authVersion doit avoir augmenté

    const userAfter =
      await prisma.user.findUniqueOrThrow({
        where: {
          id: userId,
        },
        select: {
          authVersion: true,
        },
      });

    expect(userAfter.authVersion)
      .toBe(
        userBefore.authVersion + 1,
      );

      // Un audit de sécurité doit avoir été créé

const passwordAuditCountAfter =
  await prisma.securityAuditLog.count({
    where: {
      action:
        SecurityAction.USER_PASSWORD_CHANGED,
      actorId: userId,
      targetUserId: userId,
    },
  });

expect(passwordAuditCountAfter)
  .toBe(
    passwordAuditCountBefore + 1,
  );

const passwordAuditLog =
  await prisma.securityAuditLog.findFirst({
    where: {
      action:
        SecurityAction.USER_PASSWORD_CHANGED,
      actorId: userId,
      targetUserId: userId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

expect(passwordAuditLog)
  .not.toBeNull();

expect(passwordAuditLog?.action)
  .toBe(
    SecurityAction.USER_PASSWORD_CHANGED,
  );

expect(passwordAuditLog?.actorId)
  .toBe(userId);

expect(passwordAuditLog?.targetUserId)
  .toBe(userId);


    // Ancien access token → 401

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(
        'Authorization',
        `Bearer ${oldAccessToken}`,
      )
      .expect(401);

    // Ancien refresh token → 401

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({
        refreshToken:
          oldRefreshToken,
      })
      .expect(401);

    // Ancien mot de passe → 401

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: TEST_EMAIL,
        password:
          INITIAL_PASSWORD,
      })
      .expect(401);

    // Nouveau mot de passe → login OK

    const newLoginResponse =
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: TEST_EMAIL,
          password:
            NEW_PASSWORD,
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

    // Le nouveau JWT doit fonctionner

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(
        'Authorization',
        `Bearer ${newLoginResponse.body.accessToken}`,
      )
      .expect(200);
  });

afterAll(async () => {
  await prisma.securityAuditLog.deleteMany({
    where: {
      OR: [
        {
          actorId: userId,
        },
        {
          targetUserId: userId,
        },
      ],
    },
  });

  await prisma.refreshSession.deleteMany({
    where: {
      userId,
    },
  });

  await prisma.user.deleteMany({
    where: {
      id: userId,
    },
  });

  await app.close();
});
});