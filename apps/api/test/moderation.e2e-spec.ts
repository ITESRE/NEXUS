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
  'e2e-moderation-user@nexus.local';

const MODERATOR_EMAIL =
  'e2e-moderator@nexus.local';

const ADMIN_EMAIL =
  'e2e-moderation-admin@nexus.local';

const TEST_PASSWORD =
  'E2eModerationPassword123!';

describe('Moderation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let userId: string;
  let moderatorId: string;
  let adminId: string;

  let userAccessToken: string;
  let moderatorAccessToken: string;
  let adminAccessToken: string;

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

    const emails = [
      USER_EMAIL,
      MODERATOR_EMAIL,
      ADMIN_EMAIL,
    ];

    const existingUsers =
      await prisma.user.findMany({
        where: {
          email: {
            in: emails,
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
      await prisma.moderationLog.deleteMany({
        where: {
          moderatorId: {
            in: existingIds,
          },
        },
      });

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

      await prisma.comment.deleteMany({
        where: {
          authorId: {
            in: existingIds,
          },
        },
      });

      await prisma.post.deleteMany({
        where: {
          authorId: {
            in: existingIds,
          },
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

    const passwordHash =
      await argon2.hash(
        TEST_PASSWORD,
        {
          type: argon2.argon2id,
          memoryCost: 19456,
          timeCost: 2,
          parallelism: 1,
        },
      );

    const user =
      await prisma.user.create({
        data: {
          email: USER_EMAIL,
          passwordHash,
          firstName: 'E2E',
          lastName: 'ModerationUser',
          role: 'USER',
        },
      });

    const moderator =
      await prisma.user.create({
        data: {
          email: MODERATOR_EMAIL,
          passwordHash,
          firstName: 'E2E',
          lastName: 'Moderator',
          role: 'MODERATOR',
        },
      });

    const admin =
      await prisma.user.create({
        data: {
          email: ADMIN_EMAIL,
          passwordHash,
          firstName: 'E2E',
          lastName: 'ModerationAdmin',
          role: 'ADMIN',
        },
      });

    userId = user.id;
    moderatorId = moderator.id;
    adminId = admin.id;

    const userLogin =
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: USER_EMAIL,
          password: TEST_PASSWORD,
        });

    const moderatorLogin =
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: MODERATOR_EMAIL,
          password: TEST_PASSWORD,
        });

    const adminLogin =
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: ADMIN_EMAIL,
          password: TEST_PASSWORD,
        });

    expect([200, 201]).toContain(
      userLogin.status,
    );

    expect([200, 201]).toContain(
      moderatorLogin.status,
    );

    expect([200, 201]).toContain(
      adminLogin.status,
    );

    userAccessToken =
      userLogin.body.accessToken;

    moderatorAccessToken =
      moderatorLogin.body.accessToken;

    adminAccessToken =
      adminLogin.body.accessToken;
  });

  it('refuse les contenus supprimes sans authentification', async () => {
    await request(app.getHttpServer())
      .get('/api/moderation/posts/deleted')
      .expect(401);

    await request(app.getHttpServer())
      .get(
        '/api/moderation/comments/deleted',
      )
      .expect(401);
  });

  it('refuse un USER sur les contenus supprimes', async () => {
    await request(app.getHttpServer())
      .get('/api/moderation/posts/deleted')
      .set(
        'Authorization',
        `Bearer ${userAccessToken}`,
      )
      .expect(403);

    await request(app.getHttpServer())
      .get(
        '/api/moderation/comments/deleted',
      )
      .set(
        'Authorization',
        `Bearer ${userAccessToken}`,
      )
      .expect(403);
  });

  it('autorise un MODERATOR a voir les contenus supprimes', async () => {
    await request(app.getHttpServer())
      .get('/api/moderation/posts/deleted')
      .set(
        'Authorization',
        `Bearer ${moderatorAccessToken}`,
      )
      .expect(200);

    await request(app.getHttpServer())
      .get(
        '/api/moderation/comments/deleted',
      )
      .set(
        'Authorization',
        `Bearer ${moderatorAccessToken}`,
      )
      .expect(200);
  });

  it('autorise un ADMIN a voir les contenus supprimes', async () => {
    await request(app.getHttpServer())
      .get('/api/moderation/posts/deleted')
      .set(
        'Authorization',
        `Bearer ${adminAccessToken}`,
      )
      .expect(200);

    await request(app.getHttpServer())
      .get(
        '/api/moderation/comments/deleted',
      )
      .set(
        'Authorization',
        `Bearer ${adminAccessToken}`,
      )
      .expect(200);
  });

  afterAll(async () => {
    await prisma.moderationLog.deleteMany({
      where: {
        moderatorId: {
          in: [
            userId,
            moderatorId,
            adminId,
          ],
        },
      },
    });

    await prisma.securityAuditLog.deleteMany({
      where: {
        OR: [
          {
            actorId: {
              in: [
                userId,
                moderatorId,
                adminId,
              ],
            },
          },
          {
            targetUserId: {
              in: [
                userId,
                moderatorId,
                adminId,
              ],
            },
          },
        ],
      },
    });

    await prisma.comment.deleteMany({
      where: {
        authorId: {
          in: [
            userId,
            moderatorId,
            adminId,
          ],
        },
      },
    });

    await prisma.post.deleteMany({
      where: {
        authorId: {
          in: [
            userId,
            moderatorId,
            adminId,
          ],
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            userId,
            moderatorId,
            adminId,
          ],
        },
      },
    });

    await app.close();
  });
});