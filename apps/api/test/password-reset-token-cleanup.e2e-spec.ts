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
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PasswordResetTokenCleanupService } from '../src/auth/password-reset-token-cleanup.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashPassword } from '../src/security/password.security';

const TEST_EMAIL =
  'e2e-password-reset-cleanup@nexus.local';

const TEST_PASSWORD =
  'CleanupPassword123!';

describe('Nettoyage des tokens de reset (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cleanupService:
    PasswordResetTokenCleanupService;
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

    cleanupService = app.get(
      PasswordResetTokenCleanupService,
    );

    await prisma.user.deleteMany({
      where: {
        email: TEST_EMAIL,
      },
    });

    const passwordHash =
      await hashPassword(TEST_PASSWORD);

    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        firstName: 'Reset',
        lastName: 'Cleanup',
      },
      select: {
        id: true,
      },
    });

    userId = user.id;
  });

  it('supprime uniquement les tokens expirés ou utilisés depuis plus de 7 jours', async () => {
    const now =
      new Date('2026-01-31T12:00:00.000Z');

    const day =
      24 * 60 * 60 * 1000;

    await prisma.passwordResetToken.createMany({
      data: [
        {
          tokenHash:
            'reset-cleanup-old-expired',
          userId,
          expiresAt: new Date(
            now.getTime() - 8 * day,
          ),
        },
        {
          tokenHash:
            'reset-cleanup-old-used',
          userId,
          expiresAt: new Date(
            now.getTime() + 30 * day,
          ),
          usedAt: new Date(
            now.getTime() - 8 * day,
          ),
        },
        {
          tokenHash:
            'reset-cleanup-recent-expired',
          userId,
          expiresAt: new Date(
            now.getTime() - 6 * day,
          ),
        },
        {
          tokenHash:
            'reset-cleanup-recent-used',
          userId,
          expiresAt: new Date(
            now.getTime() + 30 * day,
          ),
          usedAt: new Date(
            now.getTime() - 6 * day,
          ),
        },
        {
          tokenHash:
            'reset-cleanup-active',
          userId,
          expiresAt: new Date(
            now.getTime() + 30 * day,
          ),
        },
      ],
    });

    const deletedCount =
      await cleanupService.cleanupOldTokens(
        now,
      );

    expect(deletedCount).toBe(2);

    const remainingTokens =
      await prisma.passwordResetToken.findMany({
        where: {
          userId,
        },
        select: {
          tokenHash: true,
        },
        orderBy: {
          tokenHash: 'asc',
        },
      });

    expect(
      remainingTokens.map(
        (token) => token.tokenHash,
      ),
    ).toEqual([
      'reset-cleanup-active',
      'reset-cleanup-recent-expired',
      'reset-cleanup-recent-used',
    ]);
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