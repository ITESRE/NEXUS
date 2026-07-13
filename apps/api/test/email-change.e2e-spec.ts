import { INestApplication } from '@nestjs/common';
import {
  Test,
  TestingModule,
} from '@nestjs/testing';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  generateEmailChangeToken,
  getEmailChangeTokenExpirationDate,
  hashEmailChangeToken,
} from '../src/security/email-change-token.security';
import { hashPassword } from '../src/security/password.security';

const TEST_EMAIL =
  'e2e-email-change@nexus.local';

const FIRST_NEW_EMAIL =
  'first-new-email@nexus.local';

const SECOND_NEW_EMAIL =
  'second-new-email@nexus.local';

const OCCUPIED_EMAIL =
  'occupied-email@nexus.local';

const TEST_PASSWORD =
  'EmailChangePassword123!';

describe('Changement d’adresse email (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userId: string;

  const sendEmailChangeVerificationEmailMock =
    jest.fn(
      async (
        _recipientEmail: string,
        _emailChangeToken: string,
      ): Promise<void> => undefined,
    );

  const loginTestUser = async () => {
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

    return {
      accessToken:
        response.body.accessToken as string,
      refreshToken:
        response.body.refreshToken as string,
    };
  };

  const createEmailChangeToken = async (
  newEmail: string,
  options: {
    expired?: boolean;
    used?: boolean;
  } = {},
): Promise<string> => {
  const emailChangeToken =
    generateEmailChangeToken();

  const now = new Date();

    await prisma.emailChangeToken.create({
      data: {
        tokenHash:
          hashEmailChangeToken(
            emailChangeToken,
          ),
        userId,
        newEmail,
        expiresAt: options.expired
          ? new Date(
              now.getTime() - 60_000,
            )
          : getEmailChangeTokenExpirationDate(
              now,
            ),
        usedAt: options.used
          ? now
          : null,
      },
    });

    return emailChangeToken;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule =
      await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(MailService)
        .useValue({
          sendPasswordResetEmail:
            jest.fn(),
          sendEmailChangeVerificationEmail:
            sendEmailChangeVerificationEmailMock,
        })
        .compile();

    app =
      moduleFixture.createNestApplication();

    setupApp(app);

    await app.init();

    prisma = app.get(PrismaService);

    await prisma.securityAuditLog.deleteMany({
      where: {
        OR: [
          {
            actor: {
              email: {
                in: [
                  TEST_EMAIL,
                  FIRST_NEW_EMAIL,
                  SECOND_NEW_EMAIL,
                  OCCUPIED_EMAIL,
                ],
              },
            },
          },
          {
            targetUser: {
              email: {
                in: [
                  TEST_EMAIL,
                  FIRST_NEW_EMAIL,
                  SECOND_NEW_EMAIL,
                  OCCUPIED_EMAIL,
                ],
              },
            },
          },
        ],
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            TEST_EMAIL,
            FIRST_NEW_EMAIL,
            SECOND_NEW_EMAIL,
            OCCUPIED_EMAIL,
          ],
        },
      },
    });

    const passwordHash =
      await hashPassword(TEST_PASSWORD);

    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        firstName: 'Email',
        lastName: 'Change',
      },
      select: {
        id: true,
      },
    });

    userId = user.id;

    await prisma.user.create({
      data: {
        email: OCCUPIED_EMAIL,
        passwordHash,
        firstName: 'Occupied',
        lastName: 'Email',
      },
    });
  });

  beforeEach(async () => {
    sendEmailChangeVerificationEmailMock
      .mockClear();

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

    await prisma.emailChangeToken.deleteMany({
      where: {
        userId,
      },
    });

    await prisma.refreshSession.deleteMany({
      where: {
        userId,
      },
    });

    const passwordHash =
      await hashPassword(TEST_PASSWORD);

    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        email: TEST_EMAIL,
        passwordHash,
        authVersion: 0,
        status: 'ACTIVE',
      },
    });
  });

  it('refuse une demande sans JWT', async () => {
    await request(app.getHttpServer())
      .post(
        '/api/profile/email-change/request',
      )
      .send({
        currentPassword: TEST_PASSWORD,
        newEmail: FIRST_NEW_EMAIL,
      })
      .expect(401);

    expect(
      sendEmailChangeVerificationEmailMock,
    ).not.toHaveBeenCalled();
  });

  it('refuse un mot de passe actuel incorrect', async () => {
    const { accessToken } =
      await loginTestUser();

    await request(app.getHttpServer())
      .post(
        '/api/profile/email-change/request',
      )
      .set(
        'Authorization',
        `Bearer ${accessToken}`,
      )
      .send({
        currentPassword:
          'WrongPassword123!',
        newEmail: FIRST_NEW_EMAIL,
      })
      .expect(401);

    expect(
      sendEmailChangeVerificationEmailMock,
    ).not.toHaveBeenCalled();
  });

  it('refuse une adresse email déjà utilisée', async () => {
    const { accessToken } =
      await loginTestUser();

    await request(app.getHttpServer())
      .post(
        '/api/profile/email-change/request',
      )
      .set(
        'Authorization',
        `Bearer ${accessToken}`,
      )
      .send({
        currentPassword: TEST_PASSWORD,
        newEmail: OCCUPIED_EMAIL,
      })
      .expect(409);

    expect(
      sendEmailChangeVerificationEmailMock,
    ).not.toHaveBeenCalled();
  });

  it('crée un token hashé et invalide la demande précédente', async () => {
    const { accessToken } =
      await loginTestUser();

    await request(app.getHttpServer())
      .post(
        '/api/profile/email-change/request',
      )
      .set(
        'Authorization',
        `Bearer ${accessToken}`,
      )
      .send({
        currentPassword: TEST_PASSWORD,
        newEmail:
          'First-New-Email@NEXUS.Local',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(
        '/api/profile/email-change/request',
      )
      .set(
        'Authorization',
        `Bearer ${accessToken}`,
      )
      .send({
        currentPassword: TEST_PASSWORD,
        newEmail: SECOND_NEW_EMAIL,
      })
      .expect(200);

    expect(
      sendEmailChangeVerificationEmailMock,
    ).toHaveBeenCalledTimes(2);

    const firstCall =
      sendEmailChangeVerificationEmailMock
        .mock.calls[0];

    const secondCall =
      sendEmailChangeVerificationEmailMock
        .mock.calls[1];

    const firstRecipient = firstCall[0];
    const firstToken = firstCall[1];

    const secondRecipient = secondCall[0];
    const secondToken = secondCall[1];

    expect(firstRecipient).toBe(
      FIRST_NEW_EMAIL,
    );

    expect(secondRecipient).toBe(
      SECOND_NEW_EMAIL,
    );

    expect(firstToken).toHaveLength(64);
    expect(secondToken).toHaveLength(64);

    expect(secondToken).not.toBe(firstToken);

    const firstStoredToken =
      await prisma.emailChangeToken
        .findUniqueOrThrow({
          where: {
            tokenHash:
              hashEmailChangeToken(
                firstToken,
              ),
          },
          select: {
            newEmail: true,
            usedAt: true,
          },
        });

    const secondStoredToken =
      await prisma.emailChangeToken
        .findUniqueOrThrow({
          where: {
            tokenHash:
              hashEmailChangeToken(
                secondToken,
              ),
          },
          select: {
            newEmail: true,
            expiresAt: true,
            usedAt: true,
          },
        });

    expect(firstStoredToken.newEmail)
      .toBe(FIRST_NEW_EMAIL);

    expect(firstStoredToken.usedAt)
      .not.toBeNull();

    expect(secondStoredToken.newEmail)
      .toBe(SECOND_NEW_EMAIL);

    expect(secondStoredToken.usedAt)
      .toBeNull();

    expect(
      secondStoredToken.expiresAt.getTime(),
    ).toBeGreaterThan(Date.now());

    expect(
      hashEmailChangeToken(secondToken),
    ).not.toBe(secondToken);
  });

  it('refuse un token de changement d’adresse inconnu', async () => {
    const unknownToken =
      generateEmailChangeToken();

    await request(app.getHttpServer())
      .post(
        '/api/profile/email-change/confirm',
      )
      .send({
        token: unknownToken,
      })
      .expect(400);
  });

it('refuse un token de changement d’adresse expiré', async () => {
    const expiredToken =
      await createEmailChangeToken(
        FIRST_NEW_EMAIL,
        {
          expired: true,
        },
      );

    await request(app.getHttpServer())
      .post(
        '/api/profile/email-change/confirm',
      )
      .send({
        token: expiredToken,
      })
      .expect(400);
  });

  it('refuse un token de changement d’adresse déjà utilisé', async () => {
    const usedToken =
      await createEmailChangeToken(
        FIRST_NEW_EMAIL,
        {
          used: true,
        },
      );

    await request(app.getHttpServer())
      .post(
        '/api/profile/email-change/confirm',
      )
      .send({
        token: usedToken,
      })
      .expect(400);
  });

  it('refuse la confirmation si la nouvelle adresse est devenue indisponible', async () => {
    const emailChangeToken =
      await createEmailChangeToken(
        OCCUPIED_EMAIL,
      );

    await request(app.getHttpServer())
      .post(
        '/api/profile/email-change/confirm',
      )
      .send({
        token: emailChangeToken,
      })
      .expect(409);

    const storedToken =
      await prisma.emailChangeToken
        .findUniqueOrThrow({
          where: {
            tokenHash:
              hashEmailChangeToken(
                emailChangeToken,
              ),
          },
          select: {
            usedAt: true,
          },
        });

    expect(storedToken.usedAt).toBeNull();
  });

  it('change l’adresse email, invalide les sessions et audite l’action', async () => {
    const {
      accessToken: oldAccessToken,
      refreshToken: oldRefreshToken,
    } = await loginTestUser();

    const userBefore =
      await prisma.user.findUniqueOrThrow({
        where: {
          id: userId,
        },
        select: {
          email: true,
          authVersion: true,
        },
      });

    const emailChangeToken =
      await createEmailChangeToken(
        FIRST_NEW_EMAIL,
      );

    const secondEmailChangeToken =
      await createEmailChangeToken(
        SECOND_NEW_EMAIL,
      );

    const response =
      await request(app.getHttpServer())
        .post(
          '/api/profile/email-change/confirm',
        )
        .send({
          token: emailChangeToken,
        })
        .expect(200);

    expect(response.body.message).toBe(
      'Adresse email modifiée avec succès',
    );

    const userAfter =
      await prisma.user.findUniqueOrThrow({
        where: {
          id: userId,
        },
        select: {
          email: true,
          authVersion: true,
        },
      });

    expect(userAfter.email).toBe(
      FIRST_NEW_EMAIL,
    );

    expect(userAfter.authVersion).toBe(
      userBefore.authVersion + 1,
    );

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(
        'Authorization',
        `Bearer ${oldAccessToken}`,
      )
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({
        refreshToken: oldRefreshToken,
      })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      })
      .expect(401);

    const newLoginResponse =
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: FIRST_NEW_EMAIL,
          password: TEST_PASSWORD,
        });

    expect([200, 201]).toContain(
      newLoginResponse.status,
    );

    expect(
      newLoginResponse.body.accessToken,
    ).toBeDefined();

    const storedTokens =
      await prisma.emailChangeToken.findMany({
        where: {
          tokenHash: {
            in: [
              hashEmailChangeToken(
                emailChangeToken,
              ),
              hashEmailChangeToken(
                secondEmailChangeToken,
              ),
            ],
          },
        },
        select: {
          usedAt: true,
        },
      });

    expect(storedTokens).toHaveLength(2);

    for (const token of storedTokens) {
      expect(token.usedAt).not.toBeNull();
    }

    const auditLogs =
      await prisma.securityAuditLog.findMany({
        where: {
          action:
            'USER_EMAIL_CHANGED',
          actorId: userId,
          targetUserId: userId,
        },
        select: {
          previousEmail: true,
          newEmail: true,
        },
      });

    expect(auditLogs).toEqual([
      {
        previousEmail: TEST_EMAIL,
        newEmail: FIRST_NEW_EMAIL,
      },
    ]);

    await request(app.getHttpServer())
      .post(
        '/api/profile/email-change/confirm',
      )
      .send({
        token: emailChangeToken,
      })
      .expect(400);
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

    await prisma.emailChangeToken.deleteMany({
      where: {
        userId,
      },
    });

    await prisma.refreshSession.deleteMany({
      where: {
        userId,
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            TEST_EMAIL,
            FIRST_NEW_EMAIL,
            SECOND_NEW_EMAIL,
            OCCUPIED_EMAIL,
          ],
        },
      },
    });

    await app.close();
  });
});