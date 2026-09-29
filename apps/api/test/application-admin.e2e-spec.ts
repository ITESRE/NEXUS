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
import { hashPassword } from '../src/security/password.security';

const USER_EMAIL =
  'e2e-application-admin-user@nexus.local';

const ADMIN_EMAIL =
  'e2e-application-admin-admin@nexus.local';

const SUPER_ADMIN_EMAIL =
  'e2e-application-admin-super@nexus.local';

const PROTECTED_SUPER_ADMIN_EMAIL =
  'e2e-application-admin-protected-super@nexus.local';

const TEST_APPLICATION_KEY =
  'E2E_APPLICATION_ADMIN';

const TEST_PASSWORD =
  randomBytes(24)
    .toString('base64url');

describe(
  'Administration des acces applicatifs (e2e)',
  () => {
    let app:
      INestApplication<App>;

    let prisma:
      PrismaService;

    let userId:
      string;

    let adminId:
      string;

    let superAdminId:
      string;

    let protectedSuperAdminId:
      string;

    let userAccessToken:
      string;

    let adminAccessToken:
      string;

    let superAdminAccessToken:
      string;

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
              in: [
                USER_EMAIL,
                ADMIN_EMAIL,
                SUPER_ADMIN_EMAIL,
                PROTECTED_SUPER_ADMIN_EMAIL,
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

      /*
       * Nettoyage d'anciens runs.
       */
      await prisma.securityAuditLog
        .deleteMany({
          where: {
            OR: [
              {
                applicationKey:
                  TEST_APPLICATION_KEY,
              },

              ...(existingIds.length > 0
                ? [
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
                  ]
                : []),
            ],
          },
        });

      if (existingIds.length > 0) {
        await prisma.refreshSession
          .deleteMany({
            where: {
              userId: {
                in: existingIds,
              },
            },
          });

        await prisma.userApplicationAccess
          .deleteMany({
            where: {
              userId: {
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

      await prisma.application.deleteMany({
        where: {
          key:
            TEST_APPLICATION_KEY,
        },
      });

      const passwordHash =
        await hashPassword(
          TEST_PASSWORD,
        );

      const user =
        await prisma.user.create({
          data: {
            email:
              USER_EMAIL,

            passwordHash,

            firstName:
              'E2E',

            lastName:
              'ApplicationUser',

            platformRole:
              'USER',
          },
          select: {
            id: true,
          },
        });

      userId =
        user.id;

      const admin =
        await prisma.user.create({
          data: {
            email:
              ADMIN_EMAIL,

            passwordHash,

            firstName:
              'E2E',

            lastName:
              'ApplicationAdmin',

            platformRole:
              'ADMIN',
          },
          select: {
            id: true,
          },
        });

      adminId =
        admin.id;

      const superAdmin =
        await prisma.user.create({
          data: {
            email:
              SUPER_ADMIN_EMAIL,

            passwordHash,

            firstName:
              'E2E',

            lastName:
              'ApplicationSuperAdmin',

            platformRole:
              'SUPER_ADMIN',
          },
          select: {
            id: true,
          },
        });

      superAdminId =
        superAdmin.id;

      const protectedSuperAdmin =
        await prisma.user.create({
          data: {
            email:
              PROTECTED_SUPER_ADMIN_EMAIL,

            passwordHash,

            firstName:
              'E2E',

            lastName:
              'ProtectedSuperAdmin',

            platformRole:
              'SUPER_ADMIN',
          },
          select: {
            id: true,
          },
        });

      protectedSuperAdminId =
        protectedSuperAdmin.id;

      await prisma.application.create({
        data: {
          key:
            TEST_APPLICATION_KEY,

          name:
            'Application Admin E2E',

          description:
            'Application dediee aux tests administratifs',

          enabled:
            true,

          sortOrder:
            9000,
        },
      });

      /*
       * On utilise directement AuthService :
       * le test porte sur les autorisations
       * applicatives, pas sur le throttling login.
       */
      const authService =
        app.get(AuthService);

      const userLogin =
        await authService.login({
          email:
            USER_EMAIL,

          password:
            TEST_PASSWORD,
        });

      userAccessToken =
        userLogin.accessToken;

      const adminLogin =
        await authService.login({
          email:
            ADMIN_EMAIL,

          password:
            TEST_PASSWORD,
        });

      adminAccessToken =
        adminLogin.accessToken;

      const superAdminLogin =
        await authService.login({
          email:
            SUPER_ADMIN_EMAIL,

          password:
            TEST_PASSWORD,
        });

      superAdminAccessToken =
        superAdminLogin.accessToken;
    });

    it(
      'protege les lectures administratives',
      async () => {
        await request(
          app.getHttpServer(),
        )
          .get('/api/applications')
          .expect(401);

        await request(
          app.getHttpServer(),
        )
          .get('/api/applications')
          .set(
            'Authorization',
            `Bearer ${userAccessToken}`,
          )
          .expect(403);

        await request(
          app.getHttpServer(),
        )
          .get(
            `/api/applications/users/${userId}`,
          )
          .set(
            'Authorization',
            `Bearer ${userAccessToken}`,
          )
          .expect(403);
      },
    );

    it(
      'autorise ADMIN a consulter le catalogue et les acces',
      async () => {
        const catalogueResponse =
          await request(
            app.getHttpServer(),
          )
            .get('/api/applications')
            .set(
              'Authorization',
              `Bearer ${adminAccessToken}`,
            )
            .expect(200);

        const application =
          catalogueResponse
            .body
            .applications
            .find(
              (item: {
                key: string;
              }) =>
                item.key ===
                TEST_APPLICATION_KEY,
            );

        expect(application)
          .toEqual({
            key:
              TEST_APPLICATION_KEY,

            name:
              'Application Admin E2E',

            description:
              'Application dediee aux tests administratifs',

            enabled:
              true,

            sortOrder:
              9000,
          });

        const accessResponse =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/api/applications/users/${userId}`,
            )
            .set(
              'Authorization',
              `Bearer ${adminAccessToken}`,
            )
            .expect(200);

        expect(
          accessResponse.body.user,
        ).toEqual({
          id:
            userId,

          platformRole:
            'USER',

          status:
            'ACTIVE',
        });

        const userApplication =
          accessResponse
            .body
            .applications
            .find(
              (item: {
                key: string;
              }) =>
                item.key ===
                TEST_APPLICATION_KEY,
            );

        expect(userApplication)
          .toMatchObject({
            key:
              TEST_APPLICATION_KEY,

            enabled:
              true,

            hasAccess:
              false,

            grantedAt:
              null,
          });
      },
    );

    it(
      'interdit a ADMIN de modifier les acces',
      async () => {
        await request(
          app.getHttpServer(),
        )
          .put(
            `/api/applications/users/${userId}/${TEST_APPLICATION_KEY}`,
          )
          .set(
            'Authorization',
            `Bearer ${adminAccessToken}`,
          )
          .expect(403);

        await request(
          app.getHttpServer(),
        )
          .delete(
            `/api/applications/users/${userId}/${TEST_APPLICATION_KEY}`,
          )
          .set(
            'Authorization',
            `Bearer ${adminAccessToken}`,
          )
          .expect(403);
      },
    );

    it(
      'autorise SUPER_ADMIN a attribuer un acces et audite atomiquement',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .put(
              `/api/applications/users/${userId}/${TEST_APPLICATION_KEY}`,
            )
            .set(
              'Authorization',
              `Bearer ${superAdminAccessToken}`,
            )
            .expect(200);

        expect(response.body)
          .toMatchObject({
            changed:
              true,

            userId,

            hasAccess:
              true,

            application: {
              key:
                TEST_APPLICATION_KEY,

              enabled:
                true,
            },
          });

        const application =
          await prisma.application
            .findUniqueOrThrow({
              where: {
                key:
                  TEST_APPLICATION_KEY,
              },
              select: {
                id: true,
              },
            });

        const accessCount =
          await prisma
            .userApplicationAccess
            .count({
              where: {
                userId,

                applicationId:
                  application.id,
              },
            });

        expect(accessCount)
          .toBe(1);

        const audits =
          await prisma.securityAuditLog
            .findMany({
              where: {
                action:
                  'USER_APPLICATION_ACCESS_GRANTED',

                actorId:
                  superAdminId,

                targetUserId:
                  userId,

                applicationKey:
                  TEST_APPLICATION_KEY,
              },
            });

        expect(audits)
          .toHaveLength(1);

        const readResponse =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/api/applications/users/${userId}`,
            )
            .set(
              'Authorization',
              `Bearer ${adminAccessToken}`,
            )
            .expect(200);

        const readApplication =
          readResponse
            .body
            .applications
            .find(
              (item: {
                key: string;
              }) =>
                item.key ===
                TEST_APPLICATION_KEY,
            );

        expect(readApplication)
          .toMatchObject({
            hasAccess:
              true,
          });

        expect(
          readApplication.grantedAt,
        ).not.toBeNull();
      },
    );

    it(
      'rend le grant idempotent sans faux audit',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .put(
              `/api/applications/users/${userId}/${TEST_APPLICATION_KEY}`,
            )
            .set(
              'Authorization',
              `Bearer ${superAdminAccessToken}`,
            )
            .expect(200);

        expect(response.body)
          .toMatchObject({
            changed:
              false,

            hasAccess:
              true,
          });

        const auditCount =
          await prisma.securityAuditLog
            .count({
              where: {
                action:
                  'USER_APPLICATION_ACCESS_GRANTED',

                actorId:
                  superAdminId,

                targetUserId:
                  userId,

                applicationKey:
                  TEST_APPLICATION_KEY,
              },
            });

        expect(auditCount)
          .toBe(1);
      },
    );

    it(
      'protege une cible SUPER_ADMIN contre grant et revoke',
      async () => {
        await request(
          app.getHttpServer(),
        )
          .put(
            `/api/applications/users/${protectedSuperAdminId}/${TEST_APPLICATION_KEY}`,
          )
          .set(
            'Authorization',
            `Bearer ${superAdminAccessToken}`,
          )
          .expect(403);

        await request(
          app.getHttpServer(),
        )
          .delete(
            `/api/applications/users/${protectedSuperAdminId}/${TEST_APPLICATION_KEY}`,
          )
          .set(
            'Authorization',
            `Bearer ${superAdminAccessToken}`,
          )
          .expect(403);

        const forbiddenAuditCount =
          await prisma.securityAuditLog
            .count({
              where: {
                targetUserId:
                  protectedSuperAdminId,

                applicationKey:
                  TEST_APPLICATION_KEY,
              },
            });

        expect(forbiddenAuditCount)
          .toBe(0);
      },
    );

    it(
      'autorise SUPER_ADMIN a revoquer un acces et audite atomiquement',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .delete(
              `/api/applications/users/${userId}/${TEST_APPLICATION_KEY}`,
            )
            .set(
              'Authorization',
              `Bearer ${superAdminAccessToken}`,
            )
            .expect(200);

        expect(response.body)
          .toMatchObject({
            changed:
              true,

            userId,

            hasAccess:
              false,

            application: {
              key:
                TEST_APPLICATION_KEY,
            },
          });

        const application =
          await prisma.application
            .findUniqueOrThrow({
              where: {
                key:
                  TEST_APPLICATION_KEY,
              },
              select: {
                id: true,
              },
            });

        const accessCount =
          await prisma
            .userApplicationAccess
            .count({
              where: {
                userId,

                applicationId:
                  application.id,
              },
            });

        expect(accessCount)
          .toBe(0);

        const audits =
          await prisma.securityAuditLog
            .findMany({
              where: {
                action:
                  'USER_APPLICATION_ACCESS_REVOKED',

                actorId:
                  superAdminId,

                targetUserId:
                  userId,

                applicationKey:
                  TEST_APPLICATION_KEY,
              },
            });

        expect(audits)
          .toHaveLength(1);
      },
    );

    it(
      'rend le revoke idempotent sans faux audit',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .delete(
              `/api/applications/users/${userId}/${TEST_APPLICATION_KEY}`,
            )
            .set(
              'Authorization',
              `Bearer ${superAdminAccessToken}`,
            )
            .expect(200);

        expect(response.body)
          .toMatchObject({
            changed:
              false,

            hasAccess:
              false,
          });

        const auditCount =
          await prisma.securityAuditLog
            .count({
              where: {
                action:
                  'USER_APPLICATION_ACCESS_REVOKED',

                actorId:
                  superAdminId,

                targetUserId:
                  userId,

                applicationKey:
                  TEST_APPLICATION_KEY,
              },
            });

        expect(auditCount)
          .toBe(1);
      },
    );

    afterAll(async () => {
      const testIds = [
        userId,
        adminId,
        superAdminId,
        protectedSuperAdminId,
      ].filter(Boolean);

      await prisma.securityAuditLog
        .deleteMany({
          where: {
            OR: [
              {
                applicationKey:
                  TEST_APPLICATION_KEY,
              },
              {
                actorId: {
                  in:
                    testIds,
                },
              },
              {
                targetUserId: {
                  in:
                    testIds,
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
                testIds,
            },
          },
        });

      await prisma.userApplicationAccess
        .deleteMany({
          where: {
            userId: {
              in:
                testIds,
            },
          },
        });

      await prisma.user.deleteMany({
        where: {
          id: {
            in:
              testIds,
          },
        },
      });

      await prisma.application
        .deleteMany({
          where: {
            key:
              TEST_APPLICATION_KEY,
          },
        });

      await app.close();
    });
  },
);