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
import { EmailChangeTokenCleanupService } from '../src/profile/email-change-token-cleanup.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashPassword } from '../src/security/password.security';

const TEST_EMAIL =
  'e2e-email-change-cleanup@nexus.local';

const TEST_PASSWORD =
  'CleanupPassword123!';

describe('Nettoyage des tokens de changement d email (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cleanupService:
    EmailChangeTokenCleanupService;
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
      EmailChangeTokenCleanupService,
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
        firstName: 'EmailChange',
        lastName: 'Cleanup',
      },
      select: {
        id: true,
      },
    });

    userId = user.id;
  });

  it('supprime uniquement les tokens expires ou utilises depuis plus de 7 jours', async () => {
    const now =
      new Date('2026-01-31T12:00:00.000Z');

    const day =
      24 * 60 * 60 * 1000;

    await prisma.emailChangeToken.createMany({
      data: [
        {
          tokenHash:
            'email-change-cleanup-old-expired',
          userId,
          newEmail:
            'cleanup-old-expired@nexus.local',
          expiresAt: new Date(
            now.getTime() - 8 * day,
          ),
        },
        {
          tokenHash:
            'email-change-cleanup-old-used',
          userId,
          newEmail:
            'cleanup-old-used@nexus.local',
          expiresAt: new Date(
            now.getTime() + 30 * day,
          ),
          usedAt: new Date(
            now.getTime() - 8 * day,
          ),
        },
        {
          tokenHash:
            'email-change-cleanup-recent-expired',
          userId,
          newEmail:
            'cleanup-recent-expired@nexus.local',
          expiresAt: new Date(
            now.getTime() - 6 * day,
          ),
        },
        {
          tokenHash:
            'email-change-cleanup-recent-used',
          userId,
          newEmail:
            'cleanup-recent-used@nexus.local',
          expiresAt: new Date(
            now.getTime() + 30 * day,
          ),
          usedAt: new Date(
            now.getTime() - 6 * day,
          ),
        },
        {
          tokenHash:
            'email-change-cleanup-active',
          userId,
          newEmail:
            'cleanup-active@nexus.local',
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
      await prisma.emailChangeToken.findMany({
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
      'email-change-cleanup-active',
      'email-change-cleanup-recent-expired',
      'email-change-cleanup-recent-used',
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