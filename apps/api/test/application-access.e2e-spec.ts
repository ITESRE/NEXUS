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
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashPassword } from '../src/security/password.security';

const TEST_EMAIL =
  'e2e-application-access@nexus.local';

const TEST_PASSWORD =
  'E2eApplicationAccess123!';

const APP_A =
  'E2E_HUB_APP_A';

const APP_B =
  'E2E_HUB_APP_B';

const APP_DISABLED =
  'E2E_HUB_APP_DISABLED';

describe(
  'Application access / HUB (e2e)',
  () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;

    let userId: string;
    let accessToken: string;

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
        await prisma
          .userApplicationAccess
          .deleteMany({
            where: {
              userId:
                existingUser.id,
            },
          });

        await prisma
          .refreshSession
          .deleteMany({
            where: {
              userId:
                existingUser.id,
            },
          });

        await prisma.user.delete({
          where: {
            id:
              existingUser.id,
          },
        });
      }

      await prisma
        .application
        .deleteMany({
          where: {
            key: {
              in: [
                APP_A,
                APP_B,
                APP_DISABLED,
              ],
            },
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
              TEST_EMAIL,
            passwordHash,
            firstName:
              'E2E',
            lastName:
              'ApplicationAccess',
          },
        });

      userId =
        user.id;

      const applicationA =
        await prisma
          .application
          .create({
            data: {
              key: APP_A,
              name:
                'Application A',
              description:
                'Application de test A',
              enabled: true,
              sortOrder: 20,
            },
          });

      const applicationB =
        await prisma
          .application
          .create({
            data: {
              key: APP_B,
              name:
                'Application B',
              description:
                'Application de test B',
              enabled: true,
              sortOrder: 10,
            },
          });

      const disabledApplication =
        await prisma
          .application
          .create({
            data: {
              key:
                APP_DISABLED,
              name:
                'Application disabled',
              description:
                null,
              enabled: false,
              sortOrder: 1,
            },
          });

      await prisma
        .userApplicationAccess
        .createMany({
          data: [
            {
              userId,
              applicationId:
                applicationA.id,
            },
            {
              userId,
              applicationId:
                applicationB.id,
            },
            {
              userId,
              applicationId:
                disabledApplication.id,
            },
          ],
        });

      const loginResponse =
        await request(
          app.getHttpServer(),
        )
          .post('/api/auth/login')
          .send({
            email:
              TEST_EMAIL,
            password:
              TEST_PASSWORD,
          });

      expect(
        [200, 201],
      ).toContain(
        loginResponse.status,
      );

      accessToken =
        loginResponse
          .body
          .accessToken;
    });

    it(
      'refuse un utilisateur non authentifie',
      async () => {
        await request(
          app.getHttpServer(),
        )
          .get(
            '/api/applications/me',
          )
          .expect(401);
      },
    );

    it(
      'retourne uniquement les applications autorisees et actives dans l ordre HUB',
      async () => {
        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              '/api/applications/me',
            )
            .set(
              'Authorization',
              `Bearer ${accessToken}`,
            )
            .expect(200);

        expect(
          response.body,
        ).toEqual({
          applications: [
            {
              key:
                APP_B,
              name:
                'Application B',
              description:
                'Application de test B',
              sortOrder: 10,
            },
            {
              key:
                APP_A,
              name:
                'Application A',
              description:
                'Application de test A',
              sortOrder: 20,
            },
          ],
        });

        /*
         * NEXUS_SOCIAL existe dans le catalogue,
         * mais cet utilisateur n'a volontairement
         * aucun UserApplicationAccess dessus.
         */
        const keys =
          response.body
            .applications
            .map(
              (
                application: {
                  key: string;
                },
              ) =>
                application.key,
            );

        expect(keys)
          .not
          .toContain(
            'NEXUS_SOCIAL',
          );

        expect(keys)
          .not
          .toContain(
            APP_DISABLED,
          );
      },
    );

    it(
      'repercute immediatement une revocation d acces',
      async () => {
        const applicationB =
          await prisma
            .application
            .findUniqueOrThrow({
              where: {
                key: APP_B,
              },
              select: {
                id: true,
              },
            });

        await prisma
          .userApplicationAccess
          .delete({
            where: {
              userId_applicationId: {
                userId,
                applicationId:
                  applicationB.id,
              },
            },
          });

        const response =
          await request(
            app.getHttpServer(),
          )
            .get(
              '/api/applications/me',
            )
            .set(
              'Authorization',
              `Bearer ${accessToken}`,
            )
            .expect(200);

        expect(
          response.body,
        ).toEqual({
          applications: [
            {
              key:
                APP_A,
              name:
                'Application A',
              description:
                'Application de test A',
              sortOrder: 20,
            },
          ],
        });
      },
    );

    afterAll(async () => {
      if (userId) {
        await prisma
          .userApplicationAccess
          .deleteMany({
            where: {
              userId,
            },
          });

        await prisma
          .refreshSession
          .deleteMany({
            where: {
              userId,
            },
          });

        await prisma
          .user
          .deleteMany({
            where: {
              id: userId,
            },
          });
      }

      await prisma
        .application
        .deleteMany({
          where: {
            key: {
              in: [
                APP_A,
                APP_B,
                APP_DISABLED,
              ],
            },
          },
        });

      await app.close();
    });
  },
);