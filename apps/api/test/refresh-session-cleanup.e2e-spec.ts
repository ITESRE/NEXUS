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
import { PrismaService } from '../src/prisma/prisma.service';
import { RefreshSessionCleanupService } from '../src/auth/refresh-session-cleanup.service';
import { hashPassword } from '../src/security/password.security';

const TEST_EMAIL =
  'e2e-refresh-cleanup@nexus.local';

const TEST_PASSWORD =
  'CleanupPassword123!';

describe('Nettoyage des refresh sessions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cleanupService:
    RefreshSessionCleanupService;
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
      RefreshSessionCleanupService,
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
        firstName: 'Refresh',
        lastName: 'Cleanup',
      },
      select: {
        id: true,
      },
    });

    userId = user.id;
  });

  it('supprime uniquement les sessions expirées ou révoquées depuis plus de 30 jours', async () => {
    const now =
      new Date('2026-01-31T12:00:00.000Z');

    const day =
      24 * 60 * 60 * 1000;

    await prisma.refreshSession.createMany({
      data: [
        {
          tokenHash: 'cleanup-old-expired',
          userId,
          expiresAt: new Date(
            now.getTime() - 31 * day,
          ),
        },
        {
          tokenHash: 'cleanup-old-revoked',
          userId,
          expiresAt: new Date(
            now.getTime() + 60 * day,
          ),
          revokedAt: new Date(
            now.getTime() - 31 * day,
          ),
        },
        {
          tokenHash: 'cleanup-recent-expired',
          userId,
          expiresAt: new Date(
            now.getTime() - 29 * day,
          ),
        },
        {
          tokenHash: 'cleanup-recent-revoked',
          userId,
          expiresAt: new Date(
            now.getTime() + 60 * day,
          ),
          revokedAt: new Date(
            now.getTime() - 29 * day,
          ),
        },
        {
          tokenHash: 'cleanup-active',
          userId,
          expiresAt: new Date(
            now.getTime() + 60 * day,
          ),
        },
      ],
    });

    const deletedCount =
      await cleanupService.cleanupOldSessions(
        now,
      );

    expect(deletedCount).toBe(2);

    const remainingSessions =
      await prisma.refreshSession.findMany({
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
      remainingSessions.map(
        (session) => session.tokenHash,
      ),
    ).toEqual([
      'cleanup-active',
      'cleanup-recent-expired',
      'cleanup-recent-revoked',
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