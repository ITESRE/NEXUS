import {
  INestApplication,
} from '@nestjs/common';
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
import {
  randomBytes,
} from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  hashPassword,
} from '../src/security/password.security';

const USER_EMAIL =
  'e2e-user-create-user@nexus.local';

const LEGACY_ADMIN_EMAIL =
  'e2e-user-create-legacy-admin@nexus.local';

const ADMIN_EMAIL =
  'e2e-user-create-admin@nexus.local';

const SUPER_ADMIN_EMAIL =
  'e2e-user-create-super-admin@nexus.local';

const ANONYMOUS_TARGET_EMAIL =
  'e2e-user-create-anonymous-target@nexus.local';

const USER_TARGET_EMAIL =
  'e2e-user-create-user-target@nexus.local';

const LEGACY_TARGET_EMAIL =
  'e2e-user-create-legacy-target@nexus.local';

const ADMIN_TARGET_EMAIL =
  'e2e-user-create-admin-target@nexus.local';

const SUPER_ADMIN_TARGET_EMAIL =
  'e2e-user-create-super-target@nexus.local';

const TEST_EMAILS = [
  USER_EMAIL,
  LEGACY_ADMIN_EMAIL,
  ADMIN_EMAIL,
  SUPER_ADMIN_EMAIL,
  ANONYMOUS_TARGET_EMAIL,
  USER_TARGET_EMAIL,
  LEGACY_TARGET_EMAIL,
  ADMIN_TARGET_EMAIL,
  SUPER_ADMIN_TARGET_EMAIL,
];

describe(
  'Creation des utilisateurs CORE (e2e)',
  () => {
    let app:
      INestApplication<App>;

    let prisma:
      PrismaService;

    let userAccessToken:
      string;

    let legacyAdminAccessToken:
      string;

    let adminAccessToken:
      string;

    let superAdminAccessToken:
      string;

    const testPassword =
      `Nexus-E2E-Aa1!-${randomBytes(24).toString('hex')}`;

    beforeAll(async () => {
      const moduleFixture:
        TestingModule =
        await Test
          .createTestingModule({
            imports: [
              AppModule,
            ],
          })
          .compile();

      app =
        moduleFixture
          .createNestApplication();

      setupApp(app);

      await app.init();

      prisma =
        app.get(PrismaService);

      const existingUsers =
        await prisma.user.findMany({
          where: {
            email: {
              in:
                TEST_EMAILS,
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
        await prisma.securityAuditLog
          .deleteMany({
            where: {
              OR: [
                {
                  actorId: {
                    in:
                      existingIds,
                  },
                },
                {
                  targetUserId: {
                    in:
                      existingIds,
                  },
                },
              ],
            },
          });

        await prisma.refreshSession
          .deleteMany({
            where: {
              userId: {
                in:
                  existingIds,
              },
            },
          });

        await prisma.userApplicationAccess
          .deleteMany({
            where: {
              userId: {
                in:
                  existingIds,
              },
            },
          });

        await prisma.user.deleteMany({
          where: {
            id: {
              in:
                existingIds,
            },
          },
        });
      }

      const passwordHash =
        await hashPassword(
          testPassword,
        );

      await prisma.user.createMany({
        data: [
          {
            email:
              USER_EMAIL,
            passwordHash,
            firstName:
              'E2E',
            lastName:
              'CreateUser',
            role:
              'USER',
            platformRole:
              'USER',
          },
          {
            email:
              LEGACY_ADMIN_EMAIL,
            passwordHash,
            firstName:
              'E2E',
            lastName:
              'CreateLegacyAdmin',
            role:
              'ADMIN',
            platformRole:
              'USER',
          },
          {
            email:
              ADMIN_EMAIL,
            passwordHash,
            firstName:
              'E2E',
            lastName:
              'CreateAdmin',
            role:
              'USER',
            platformRole:
              'ADMIN',
          },
          {
            email:
              SUPER_ADMIN_EMAIL,
            passwordHash,
            firstName:
              'E2E',
            lastName:
              'CreateSuperAdmin',
            role:
              'USER',
            platformRole:
              'SUPER_ADMIN',
          },
        ],
      });

      /*
       * Login direct via AuthService :
       * on teste ici les autorisations de /users,
       * pas le throttling HTTP de /auth/login.
       */
      const authService =
        app.get(AuthService);

      const userLogin =
        await authService.login({
          email:
            USER_EMAIL,
          password:
            testPassword,
        });

      userAccessToken =
        userLogin.accessToken;

      const legacyAdminLogin =
        await authService.login({
          email:
            LEGACY_ADMIN_EMAIL,
          password:
            testPassword,
        });

      legacyAdminAccessToken =
        legacyAdminLogin.accessToken;

      const adminLogin =
        await authService.login({
          email:
            ADMIN_EMAIL,
          password:
            testPassword,
        });

      adminAccessToken =
        adminLogin.accessToken;

      const superAdminLogin =
        await authService.login({
          email:
            SUPER_ADMIN_EMAIL,
          password:
            testPassword,
        });

      superAdminAccessToken =
        superAdminLogin.accessToken;
    });

    it(
      'refuse la creation sans authentification',
      async () => {
        await request(
          app.getHttpServer(),
        )
          .post('/api/users')
          .send({
            email:
              ANONYMOUS_TARGET_EMAIL,
            password:
              testPassword,
            firstName:
              'Anonymous',
            lastName:
              'Target',
          })
          .expect(401);

        const created =
          await prisma.user.findUnique({
            where: {
              email:
                ANONYMOUS_TARGET_EMAIL,
            },
            select: {
              id: true,
            },
          });

        expect(created)
          .toBeNull();
      },
    );

    it(
      'refuse la creation a un PlatformRole.USER',
      async () => {
        await request(
          app.getHttpServer(),
        )
          .post('/api/users')
          .set(
            'Authorization',
            `Bearer ${userAccessToken}`,
          )
          .send({
            email:
              USER_TARGET_EMAIL,
            password:
              testPassword,
            firstName:
              'User',
            lastName:
              'Target',
          })
          .expect(403);

        const created =
          await prisma.user.findUnique({
            where: {
              email:
                USER_TARGET_EMAIL,
            },
            select: {
              id: true,
            },
          });

        expect(created)
          .toBeNull();
      },
    );

    it(
      'ignore le role legacy ADMIN sans PlatformRole ADMIN',
      async () => {
        await request(
          app.getHttpServer(),
        )
          .post('/api/users')
          .set(
            'Authorization',
            `Bearer ${legacyAdminAccessToken}`,
          )
          .send({
            email:
              LEGACY_TARGET_EMAIL,
            password:
              testPassword,
            firstName:
              'Legacy',
            lastName:
              'Target',
          })
          .expect(403);

        const created =
          await prisma.user.findUnique({
            where: {
              email:
                LEGACY_TARGET_EMAIL,
            },
            select: {
              id: true,
            },
          });

        expect(created)
          .toBeNull();
      },
    );

    it(
      'permet a un ADMIN de creer un USER CORE',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .post('/api/users')
            .set(
              'Authorization',
              `Bearer ${adminAccessToken}`,
            )
            .send({
              email:
                ADMIN_TARGET_EMAIL,
              password:
                testPassword,
              firstName:
                'Admin',
              lastName:
                'Created',
            })
            .expect(201);

        expect(response.body.email)
          .toBe(
            ADMIN_TARGET_EMAIL,
          );

        expect(
          response.body.role,
        ).toBe('USER');

        expect(
          response.body.platformRole,
        ).toBe('USER');

        expect(
          response.body.status,
        ).toBe('ACTIVE');

        expect(
          response.body.passwordHash,
        ).toBeUndefined();

        const created =
          await prisma.user
            .findUniqueOrThrow({
              where: {
                email:
                  ADMIN_TARGET_EMAIL,
              },
              select: {
                role: true,
                platformRole: true,
                status: true,
              },
            });

        expect(created)
          .toEqual({
            role:
              'USER',
            platformRole:
              'USER',
            status:
              'ACTIVE',
          });
      },
    );

    it(
      'permet a un SUPER_ADMIN de creer un USER CORE',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .post('/api/users')
            .set(
              'Authorization',
              `Bearer ${superAdminAccessToken}`,
            )
            .send({
              email:
                SUPER_ADMIN_TARGET_EMAIL,
              password:
                testPassword,
              firstName:
                'SuperAdmin',
              lastName:
                'Created',
            })
            .expect(201);

        expect(response.body.email)
          .toBe(
            SUPER_ADMIN_TARGET_EMAIL,
          );

        expect(
          response.body.role,
        ).toBe('USER');

        expect(
          response.body.platformRole,
        ).toBe('USER');

        expect(
          response.body.status,
        ).toBe('ACTIVE');

        expect(
          response.body.passwordHash,
        ).toBeUndefined();

        const created =
          await prisma.user
            .findUniqueOrThrow({
              where: {
                email:
                  SUPER_ADMIN_TARGET_EMAIL,
              },
              select: {
                role: true,
                platformRole: true,
                status: true,
              },
            });

        expect(created)
          .toEqual({
            role:
              'USER',
            platformRole:
              'USER',
            status:
              'ACTIVE',
          });
      },
    );

    afterAll(async () => {
      const users =
        await prisma.user.findMany({
          where: {
            email: {
              in:
                TEST_EMAILS,
            },
          },
          select: {
            id: true,
          },
        });

      const ids =
        users.map(
          (user) => user.id,
        );

      if (ids.length > 0) {
        await prisma.securityAuditLog
          .deleteMany({
            where: {
              OR: [
                {
                  actorId: {
                    in: ids,
                  },
                },
                {
                  targetUserId: {
                    in: ids,
                  },
                },
              ],
            },
          });

        await prisma.refreshSession
          .deleteMany({
            where: {
              userId: {
                in: ids,
              },
            },
          });

        await prisma.userApplicationAccess
          .deleteMany({
            where: {
              userId: {
                in: ids,
              },
            },
          });

        await prisma.user.deleteMany({
          where: {
            id: {
              in: ids,
            },
          },
        });
      }

      await app.close();
    });
  },
);