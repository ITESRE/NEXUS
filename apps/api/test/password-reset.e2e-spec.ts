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
import { hashPassword } from '../src/security/password.security';
import { generatePasswordResetToken, getPasswordResetTokenExpirationDate, hashPasswordResetToken } from '../src/security/password-reset-token.security';

const TEST_EMAIL =
  'e2e-password-reset@nexus.local';

const INITIAL_PASSWORD =
  'InitialPassword123!';

const NEW_PASSWORD =
  'NewPassword456!';

describe('Réinitialisation du mot de passe (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userId: string;

  const sendPasswordResetEmailMock =
    jest.fn(
      async (
        _recipientEmail: string,
        _resetToken: string,
      ): Promise<void> => undefined,
    );

    const createResetToken = async (
    options: {
        expired?: boolean;
        used?: boolean;
    } = {},
    ): Promise<string> => {
    const resetToken =
        generatePasswordResetToken();

    const now = new Date();

    await prisma.passwordResetToken.create({
        data: {
        tokenHash:
            hashPasswordResetToken(resetToken),
        userId,
        expiresAt: options.expired
            ? new Date(now.getTime() - 60_000)
            : getPasswordResetTokenExpirationDate(
                now,
            ),
        usedAt: options.used ? now : null,
        },
    });

  return resetToken;
};

  beforeAll(async () => {
    const moduleFixture: TestingModule =
      await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(MailService)
        .useValue({
          sendPasswordResetEmail:
            sendPasswordResetEmailMock,
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
              email: TEST_EMAIL,
            },
          },
          {
            targetUser: {
              email: TEST_EMAIL,
            },
          },
        ],
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: TEST_EMAIL,
      },
    });

    const passwordHash =
      await hashPassword(INITIAL_PASSWORD);

    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        firstName: 'Password',
        lastName: 'Reset',
      },
      select: {
        id: true,
      },
    });

    userId = user.id;
  });

beforeEach(async () => {
  sendPasswordResetEmailMock.mockClear();

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

  await prisma.passwordResetToken.deleteMany({
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
    await hashPassword(INITIAL_PASSWORD);

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      passwordHash,
      authVersion: 0,
      status: 'ACTIVE',
    },
  });
});

    it("retourne une réponse générique pour une adresse inconnue", async () => {
  const response =
    await request(app.getHttpServer())
      .post('/api/auth/password-reset/request')
      .send({
        email:
          'adresse-inconnue@nexus.local',
      })
      .expect(200);

  expect(response.body).toEqual({
    message:
      'Si un compte correspond, un email de réinitialisation a été envoyé',
  });

  expect(
    sendPasswordResetEmailMock,
  ).not.toHaveBeenCalled();
});

it('crée un token hashé et demande l’envoi de l’email', async () => {
  const response =
    await request(app.getHttpServer())
      .post('/api/auth/password-reset/request')
      .send({
        email: TEST_EMAIL,
      })
      .expect(200);

  expect(response.body).toEqual({
    message:
      'Si un compte correspond, un email de réinitialisation a été envoyé',
  });

  expect(
    sendPasswordResetEmailMock,
  ).toHaveBeenCalledTimes(1);

  const [
    recipientEmail,
    resetToken,
  ] =
    sendPasswordResetEmailMock.mock.calls[0];

  expect(recipientEmail).toBe(TEST_EMAIL);

  expect(typeof resetToken).toBe('string');
  expect(resetToken).toHaveLength(64);

  const tokenHash =
    hashPasswordResetToken(resetToken);

  const storedToken =
    await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        tokenHash,
      },
      select: {
        tokenHash: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
      },
    });

  expect(storedToken.userId).toBe(userId);

  expect(storedToken.tokenHash)
    .toBe(tokenHash);

  expect(storedToken.tokenHash)
    .not.toBe(resetToken);

  expect(storedToken.usedAt).toBeNull();

  expect(
    storedToken.expiresAt.getTime(),
  ).toBeGreaterThan(Date.now());
});

it('invalide l’ancien token lorsqu’une nouvelle demande est faite', async () => {
  await request(app.getHttpServer())
    .post('/api/auth/password-reset/request')
    .send({
      email: TEST_EMAIL,
    })
    .expect(200);

  await request(app.getHttpServer())
    .post('/api/auth/password-reset/request')
    .send({
      email: TEST_EMAIL,
    })
    .expect(200);

  expect(
    sendPasswordResetEmailMock,
  ).toHaveBeenCalledTimes(2);

  const firstResetToken =
    sendPasswordResetEmailMock.mock.calls[0][1];

  const secondResetToken =
    sendPasswordResetEmailMock.mock.calls[1][1];

  expect(secondResetToken)
    .not.toBe(firstResetToken);

  const firstStoredToken =
    await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        tokenHash:
          hashPasswordResetToken(
            firstResetToken,
          ),
      },
      select: {
        usedAt: true,
      },
    });

  const secondStoredToken =
    await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        tokenHash:
          hashPasswordResetToken(
            secondResetToken,
          ),
      },
      select: {
        usedAt: true,
      },
    });

  expect(
    firstStoredToken.usedAt,
  ).not.toBeNull();

  expect(
    secondStoredToken.usedAt,
  ).toBeNull();
});

it('refuse un token de réinitialisation inconnu', async () => {
  const unknownToken =
    generatePasswordResetToken();

  await request(app.getHttpServer())
    .post('/api/auth/password-reset/confirm')
    .send({
      token: unknownToken,
      newPassword: NEW_PASSWORD,
    })
    .expect(400);
});

it('refuse un token de réinitialisation expiré', async () => {
  const expiredToken =
    await createResetToken({
      expired: true,
    });

  await request(app.getHttpServer())
    .post('/api/auth/password-reset/confirm')
    .send({
      token: expiredToken,
      newPassword: NEW_PASSWORD,
    })
    .expect(400);
});

it('refuse un nouveau mot de passe trop faible sans consommer le token', async () => {
  const resetToken =
    await createResetToken();

  await request(app.getHttpServer())
    .post('/api/auth/password-reset/confirm')
    .send({
      token: resetToken,
      newPassword: 'tropcourt',
    })
    .expect(400);

  const storedToken =
    await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        tokenHash:
          hashPasswordResetToken(
            resetToken,
          ),
      },
      select: {
        usedAt: true,
      },
    });

  expect(storedToken.usedAt).toBeNull();
});

it('refuse de réutiliser le mot de passe actuel sans consommer le token', async () => {
  const resetToken =
    await createResetToken();

  await request(app.getHttpServer())
    .post('/api/auth/password-reset/confirm')
    .send({
      token: resetToken,
      newPassword: INITIAL_PASSWORD,
    })
    .expect(400);

  const storedToken =
    await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        tokenHash:
          hashPasswordResetToken(
            resetToken,
          ),
      },
      select: {
        usedAt: true,
      },
    });

  expect(storedToken.usedAt).toBeNull();
});

it('réinitialise le mot de passe, invalide les sessions et audite l’action', async () => {
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

  const userBefore =
    await prisma.user.findUniqueOrThrow({
      where: {
        id: userId,
      },
      select: {
        authVersion: true,
      },
    });

  const resetToken =
    await createResetToken();

  const secondResetToken =
    await createResetToken();

  const response =
    await request(app.getHttpServer())
      .post('/api/auth/password-reset/confirm')
      .send({
        token: resetToken,
        newPassword: NEW_PASSWORD,
      })
      .expect(200);

  expect(response.body).toEqual({
    message:
      'Mot de passe réinitialisé avec succès',
  });

  const userAfter =
    await prisma.user.findUniqueOrThrow({
      where: {
        id: userId,
      },
      select: {
        authVersion: true,
      },
    });

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
      password: INITIAL_PASSWORD,
    })
    .expect(401);

  const newLoginResponse =
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: TEST_EMAIL,
        password: NEW_PASSWORD,
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

  const consumedTokens =
    await prisma.passwordResetToken.findMany({
      where: {
        tokenHash: {
          in: [
            hashPasswordResetToken(
              resetToken,
            ),
            hashPasswordResetToken(
              secondResetToken,
            ),
          ],
        },
      },
      select: {
        usedAt: true,
      },
    });

  expect(consumedTokens).toHaveLength(2);

  for (const token of consumedTokens) {
    expect(token.usedAt).not.toBeNull();
  }

  const auditLogs =
    await prisma.securityAuditLog.findMany({
      where: {
        actorId: userId,
        targetUserId: userId,
        action:
          'USER_PASSWORD_RESET',
      },
    });

  expect(auditLogs).toHaveLength(1);

  await request(app.getHttpServer())
    .post('/api/auth/password-reset/confirm')
    .send({
      token: resetToken,
      newPassword:
        'AnotherPassword789!',
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

    await prisma.passwordResetToken.deleteMany({
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
        id: userId,
      },
    });

    await app.close();
  });
});