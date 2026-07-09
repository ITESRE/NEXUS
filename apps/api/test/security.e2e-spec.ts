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

const USER_EMAIL =
  'e2e-security-user@nexus.local';

const ADMIN_EMAIL =
  'e2e-security-admin@nexus.local';

const USER_PASSWORD =
  'E2eUserPassword123!';

const ADMIN_PASSWORD =
  'E2eAdminPassword123!';

describe('Securite administrative (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let userId: string;
  let adminId: string;

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

    const existingUsers =
      await prisma.user.findMany({
        where: {
          email: {
            in: [
              USER_EMAIL,
              ADMIN_EMAIL,
            ],
          },
        },
        select: {
          id: true,
        },
      });

    const existingIds =
      existingUsers.map(
        (user) => user.id,
      );

    if (existingIds.length > 0) {
      await prisma.securityAuditLog.deleteMany({
        where: {
          OR: [
            {
              actorId: {
                in: existingIds,
              },
            },
            {
              targetUserId: {
                in: existingIds,
              },
            },
          ],
        },
      });

      await prisma.user.deleteMany({
        where: {
          id: {
            in: existingIds,
          },
        },
      });
    }

    const userPasswordHash =
      await argon2.hash(USER_PASSWORD, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });

    const adminPasswordHash =
      await argon2.hash(ADMIN_PASSWORD, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });

    const user =
      await prisma.user.create({
        data: {
          email: USER_EMAIL,
          passwordHash:
            userPasswordHash,
          firstName: 'E2E',
          lastName: 'SecurityUser',
          role: 'USER',
        },
      });

    const admin =
      await prisma.user.create({
        data: {
          email: ADMIN_EMAIL,
          passwordHash:
            adminPasswordHash,
          firstName: 'E2E',
          lastName: 'SecurityAdmin',
          role: 'ADMIN',
        },
      });

    userId = user.id;
    adminId = admin.id;
  });

  it('permet a un ADMIN de revoquer toutes les sessions d un USER', async () => {
    const userLogin =
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: USER_EMAIL,
          password: USER_PASSWORD,
        });

    expect([200, 201]).toContain(
      userLogin.status,
    );

    const userAccessToken: string =
      userLogin.body.accessToken;

    const userRefreshToken: string =
      userLogin.body.refreshToken;

    const adminLogin =
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        });

    expect([200, 201]).toContain(
      adminLogin.status,
    );

    const adminAccessToken: string =
      adminLogin.body.accessToken;

    const userBefore =
      await prisma.user.findUniqueOrThrow({
        where: {
          id: userId,
        },
        select: {
          authVersion: true,
        },
      });

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(
        'Authorization',
        `Bearer ${userAccessToken}`,
      )
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(
        'Authorization',
        `Bearer ${adminAccessToken}`,
      )
      .expect(200);

    const revokeResponse =
      await request(app.getHttpServer())
        .post(
          `/api/auth/users/${userId}/logout-all`,
        )
        .set(
          'Authorization',
          `Bearer ${adminAccessToken}`,
        );

    expect([200, 201]).toContain(
      revokeResponse.status,
    );

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({
        refreshToken:
          userRefreshToken,
      })
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(
        'Authorization',
        `Bearer ${userAccessToken}`,
      )
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(
        'Authorization',
        `Bearer ${adminAccessToken}`,
      )
      .expect(200);

    const userAfter =
      await prisma.user.findUniqueOrThrow({
        where: {
          id: userId,
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

    const auditLog =
      await prisma.securityAuditLog.findFirst({
        where: {
          action:
            'USER_SESSIONS_REVOKED',
          actorId: adminId,
          targetUserId: userId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    expect(auditLog)
      .not.toBeNull();

    expect(auditLog?.actorId)
      .toBe(adminId);

    expect(auditLog?.targetUserId)
      .toBe(userId);

    expect(auditLog?.action)
      .toBe(
        'USER_SESSIONS_REVOKED',
      );
  });

  it('invalide les sessions lors d une desactivation et ne reactive pas les anciens tokens', async () => {
  const userLogin =
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: USER_EMAIL,
        password: USER_PASSWORD,
      });

  expect([200, 201]).toContain(
    userLogin.status,
  );

  const oldUserAccessToken: string =
    userLogin.body.accessToken;

  const oldUserRefreshToken: string =
    userLogin.body.refreshToken;

  const adminLogin =
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });

  expect([200, 201]).toContain(
    adminLogin.status,
  );

  const adminAccessToken: string =
    adminLogin.body.accessToken;

  const userBefore =
    await prisma.user.findUniqueOrThrow({
      where: {
        id: userId,
      },
      select: {
        status: true,
        authVersion: true,
      },
    });

  expect(userBefore.status)
    .toBe('ACTIVE');

  await request(app.getHttpServer())
    .get('/api/auth/me')
    .set(
      'Authorization',
      `Bearer ${oldUserAccessToken}`,
    )
    .expect(200);

  const disableResponse =
    await request(app.getHttpServer())
      .patch(
        `/api/security/users/${userId}/status`,
      )
      .set(
        'Authorization',
        `Bearer ${adminAccessToken}`,
      )
      .send({
        status: 'DISABLED',
        reason:
          'Test e2e de desactivation du compte',
      });

  expect(disableResponse.status)
    .toBe(200);

  expect(disableResponse.body.user.status)
    .toBe('DISABLED');

  await request(app.getHttpServer())
    .get('/api/auth/me')
    .set(
      'Authorization',
      `Bearer ${oldUserAccessToken}`,
    )
    .expect(401);

  await request(app.getHttpServer())
    .post('/api/auth/refresh')
    .send({
      refreshToken:
        oldUserRefreshToken,
    })
    .expect(401);

  const disabledUser =
    await prisma.user.findUniqueOrThrow({
      where: {
        id: userId,
      },
      select: {
        status: true,
        authVersion: true,
      },
    });

  expect(disabledUser.status)
    .toBe('DISABLED');

  expect(disabledUser.authVersion)
    .toBe(
      userBefore.authVersion + 1,
    );

  const reactivateResponse =
    await request(app.getHttpServer())
      .patch(
        `/api/security/users/${userId}/status`,
      )
      .set(
        'Authorization',
        `Bearer ${adminAccessToken}`,
      )
      .send({
        status: 'ACTIVE',
      });

  expect(reactivateResponse.status)
    .toBe(200);

  expect(reactivateResponse.body.user.status)
    .toBe('ACTIVE');

  await request(app.getHttpServer())
    .get('/api/auth/me')
    .set(
      'Authorization',
      `Bearer ${oldUserAccessToken}`,
    )
    .expect(401);

  const reactivatedUser =
    await prisma.user.findUniqueOrThrow({
      where: {
        id: userId,
      },
      select: {
        status: true,
        authVersion: true,
      },
    });

  expect(reactivatedUser.status)
    .toBe('ACTIVE');

  expect(reactivatedUser.authVersion)
    .toBe(
      userBefore.authVersion + 2,
    );

  const freshLogin =
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: USER_EMAIL,
        password: USER_PASSWORD,
      });

  expect([200, 201]).toContain(
    freshLogin.status,
  );

  expect(
    freshLogin.body.accessToken,
  ).toBeDefined();

  expect(
    freshLogin.body.user.status,
  ).toBe('ACTIVE');

  const disableAudit =
    await prisma.securityAuditLog.findFirst({
      where: {
        action:
          'USER_STATUS_CHANGED',
        actorId: adminId,
        targetUserId: userId,
        previousStatus: 'ACTIVE',
        newStatus: 'DISABLED',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

  expect(disableAudit)
    .not.toBeNull();

  expect(disableAudit?.reason)
    .toBe(
      'Test e2e de desactivation du compte',
    );

  const reactivateAudit =
    await prisma.securityAuditLog.findFirst({
      where: {
        action:
          'USER_STATUS_CHANGED',
        actorId: adminId,
        targetUserId: userId,
        previousStatus: 'DISABLED',
        newStatus: 'ACTIVE',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

  expect(reactivateAudit)
    .not.toBeNull();
});

  afterAll(async () => {
    await prisma.securityAuditLog.deleteMany({
      where: {
        OR: [
          {
            actorId: {
              in: [
                adminId,
                userId,
              ],
            },
          },
          {
            targetUserId: {
              in: [
                adminId,
                userId,
              ],
            },
          },
        ],
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            adminId,
            userId,
          ],
        },
      },
    });

    await app.close();
  });
});