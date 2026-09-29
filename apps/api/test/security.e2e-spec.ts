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
import { hashPassword } from '../src/security/password.security';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';

const USER_EMAIL =
  'e2e-security-user@nexus.local';

const ADMIN_EMAIL =
  'e2e-security-admin@nexus.local';

const SUPER_ADMIN_EMAIL =
  'e2e-security-super-admin@nexus.local';

const LEGACY_ADMIN_EMAIL =
  'e2e-security-legacy-admin@nexus.local';

const USER_PASSWORD =
  'E2eUserPassword123!';

const ADMIN_PASSWORD =
  'E2eAdminPassword123!';

describe('Securite administrative (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let userId: string;
  let adminId: string;
  let superAdminId: string;
  let legacyAdminId: string;

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
              SUPER_ADMIN_EMAIL,
              LEGACY_ADMIN_EMAIL,
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

    const userPasswordHash = await hashPassword(USER_PASSWORD);

    const adminPasswordHash = await hashPassword(ADMIN_PASSWORD);
    
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

    /*
     * Preuve positive :
     * legacy USER mais PlatformRole.ADMIN.
     */
    const admin =
      await prisma.user.create({
        data: {
          email: ADMIN_EMAIL,
          passwordHash:
            adminPasswordHash,
          firstName: 'E2E',
          lastName: 'SecurityAdmin',
          role: 'USER',
          platformRole: 'ADMIN',
        },
      });

    /*
     * SUPER_ADMIN plateforme avec
     * rÃ´le legacy USER.
     */
    const superAdmin =
      await prisma.user.create({
        data: {
          email: SUPER_ADMIN_EMAIL,
          passwordHash:
            adminPasswordHash,
          firstName: 'E2E',
          lastName: 'SecuritySuperAdmin',
          role: 'USER',
          platformRole: 'SUPER_ADMIN',
        },
      });

    /*
     * Preuve nÃ©gative :
     * legacy ADMIN mais PlatformRole.USER.
     */
    const legacyAdmin =
      await prisma.user.create({
        data: {
          email: LEGACY_ADMIN_EMAIL,
          passwordHash:
            adminPasswordHash,
          firstName: 'E2E',
          lastName: 'SecurityLegacyAdmin',
          role: 'ADMIN',
          platformRole: 'USER',
        },
      });

    userId = user.id;
    adminId = admin.id;
    superAdminId = superAdmin.id;
    legacyAdminId = legacyAdmin.id;
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
  it('n accorde aucun privilege CORE a un ADMIN legacy sans PlatformRole', async () => {
    const legacyAdminLogin =
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: LEGACY_ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        });

    expect([200, 201]).toContain(
      legacyAdminLogin.status,
    );

    expect(
      legacyAdminLogin.body.user.role,
    ).toBe('ADMIN');

    expect(
      legacyAdminLogin.body.user.platformRole,
    ).toBe('USER');

    const legacyAccessToken: string =
      legacyAdminLogin.body.accessToken;

    await request(app.getHttpServer())
      .get('/api/users')
      .set(
        'Authorization',
        `Bearer ${legacyAccessToken}`,
      )
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/security/audit-logs')
      .set(
        'Authorization',
        `Bearer ${legacyAccessToken}`,
      )
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `/api/auth/users/${userId}/logout-all`,
      )
      .set(
        'Authorization',
        `Bearer ${legacyAccessToken}`,
      )
      .expect(403);
  });

  it('invalide les sessions lors des changements de PlatformRole et audite les modifications', async () => {
    await prisma.refreshSession.deleteMany({
      where: {
        userId,
      },
    });

    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        role: 'USER',
        platformRole: 'USER',
        status: 'ACTIVE',
      },
    });

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

    expect(
      userLogin.body.user.role,
    ).toBe('USER');

    expect(
      userLogin.body.user.platformRole,
    ).toBe('USER');

    const oldUserAccessToken: string =
      userLogin.body.accessToken;

    const oldUserRefreshToken: string =
      userLogin.body.refreshToken;

    /*
     * ADMIN plateforme :
     * administration courante oui,
     * dÃ©lÃ©gation ADMIN non.
     */
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

    expect(
      adminLogin.body.user.role,
    ).toBe('USER');

    expect(
      adminLogin.body.user.platformRole,
    ).toBe('ADMIN');

    const adminAccessToken: string =
      adminLogin.body.accessToken;

    await request(app.getHttpServer())
      .patch(
        `/api/security/users/${userId}/platform-role`,
      )
      .set(
        'Authorization',
        `Bearer ${adminAccessToken}`,
      )
      .send({
        platformRole: 'ADMIN',
        reason:
          'Tentative ADMIN interdite',
      })
      .expect(403);

    const superAdminLogin =
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: SUPER_ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        });

    expect([200, 201]).toContain(
      superAdminLogin.status,
    );

    expect(
      superAdminLogin.body.user.role,
    ).toBe('USER');

    expect(
      superAdminLogin.body.user.platformRole,
    ).toBe('SUPER_ADMIN');

    const superAdminAccessToken: string =
      superAdminLogin.body.accessToken;

    const userBefore =
      await prisma.user.findUniqueOrThrow({
        where: {
          id: userId,
        },
        select: {
          role: true,
          platformRole: true,
          authVersion: true,
        },
      });

    expect(userBefore.role)
      .toBe('USER');

    expect(userBefore.platformRole)
      .toBe('USER');

    // PlatformRole.USER -> ADMIN

    const promoteResponse =
      await request(app.getHttpServer())
        .patch(
          `/api/security/users/${userId}/platform-role`,
        )
        .set(
          'Authorization',
          `Bearer ${superAdminAccessToken}`,
        )
        .send({
          platformRole: 'ADMIN',
          reason:
            'Test e2e de promotion plateforme vers ADMIN',
        });

    expect(promoteResponse.status)
      .toBe(200);

    expect(
      promoteResponse.body.user.platformRole,
    ).toBe('ADMIN');

    /*
     * Le rÃ´le legacy n'est jamais
     * modifiÃ© par cette route.
     */
    expect(
      promoteResponse.body.user.role,
    ).toBe('USER');

    // Anciens tokens invalidÃ©s

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({
        refreshToken:
          oldUserRefreshToken,
      })
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(
        'Authorization',
        `Bearer ${oldUserAccessToken}`,
      )
      .expect(401);

    const promotedUser =
      await prisma.user.findUniqueOrThrow({
        where: {
          id: userId,
        },
        select: {
          role: true,
          platformRole: true,
          authVersion: true,
        },
      });

    expect(promotedUser.role)
      .toBe('USER');

    expect(promotedUser.platformRole)
      .toBe('ADMIN');

    expect(promotedUser.authVersion)
      .toBe(
        userBefore.authVersion + 1,
      );

    // Nouveau login Platform ADMIN

    const promotedLogin =
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: USER_EMAIL,
          password: USER_PASSWORD,
        });

    expect([200, 201]).toContain(
      promotedLogin.status,
    );

    expect(
      promotedLogin.body.user.role,
    ).toBe('USER');

    expect(
      promotedLogin.body.user.platformRole,
    ).toBe('ADMIN');

    const promotedAccessToken: string =
      promotedLogin.body.accessToken;

    const promotedRefreshToken: string =
      promotedLogin.body.refreshToken;

    /*
     * Le PlatformRole.ADMIN permet bien
     * l'administration CORE...
     */
    await request(app.getHttpServer())
      .get('/api/users')
      .set(
        'Authorization',
        `Bearer ${promotedAccessToken}`,
      )
      .expect(200);

    /*
     * ...mais ne donne aucun droit
     * NEXUS Social.
     */
    await request(app.getHttpServer())
      .get(
        '/api/moderation/posts/deleted',
      )
      .set(
        'Authorization',
        `Bearer ${promotedAccessToken}`,
      )
      .expect(403);

    // PlatformRole.ADMIN -> USER

    const demoteResponse =
      await request(app.getHttpServer())
        .patch(
          `/api/security/users/${userId}/platform-role`,
        )
        .set(
          'Authorization',
          `Bearer ${superAdminAccessToken}`,
        )
        .send({
          platformRole: 'USER',
          reason:
            'Test e2e de retour plateforme vers USER',
        });

    expect(demoteResponse.status)
      .toBe(200);

    expect(
      demoteResponse.body.user.platformRole,
    ).toBe('USER');

    expect(
      demoteResponse.body.user.role,
    ).toBe('USER');

    // Tokens du Platform ADMIN invalidÃ©s

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({
        refreshToken:
          promotedRefreshToken,
      })
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(
        'Authorization',
        `Bearer ${promotedAccessToken}`,
      )
      .expect(401);

    const demotedUser =
      await prisma.user.findUniqueOrThrow({
        where: {
          id: userId,
        },
        select: {
          role: true,
          platformRole: true,
          authVersion: true,
        },
      });

    expect(demotedUser.role)
      .toBe('USER');

    expect(demotedUser.platformRole)
      .toBe('USER');

    expect(demotedUser.authVersion)
      .toBe(
        userBefore.authVersion + 2,
      );


    const promotionAudit =
      await prisma.securityAuditLog.findFirst({
        where: {
          action:
            'USER_PLATFORM_ROLE_CHANGED',
          actorId:
            superAdminId,
          targetUserId:
            userId,
          previousPlatformRole:
            'USER',
          newPlatformRole:
            'ADMIN',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    expect(promotionAudit)
      .not.toBeNull();

    expect(
      promotionAudit?.reason,
    ).toBe(
      'Test e2e de promotion plateforme vers ADMIN',
    );

    const demotionAudit =
      await prisma.securityAuditLog.findFirst({
        where: {
          action:
            'USER_PLATFORM_ROLE_CHANGED',
          actorId:
            superAdminId,
          targetUserId:
            userId,
          previousPlatformRole:
            'ADMIN',
          newPlatformRole:
            'USER',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    expect(demotionAudit)
      .not.toBeNull();

    expect(
      demotionAudit?.reason,
    ).toBe(
      'Test e2e de retour plateforme vers USER',
    );
  });
  it('protege un SUPER_ADMIN contre les routes administratives normales', async () => {
    const protectedEmail =
      'e2e-security-protected-super-admin@nexus.local';

    const existingProtected =
      await prisma.user.findUnique({
        where: {
          email: protectedEmail,
        },
        select: {
          id: true,
        },
      });

    if (existingProtected) {
      await prisma.securityAuditLog
        .deleteMany({
          where: {
            OR: [
              {
                actorId:
                  existingProtected.id,
              },
              {
                targetUserId:
                  existingProtected.id,
              },
            ],
          },
        });

      await prisma.refreshSession
        .deleteMany({
          where: {
            userId:
              existingProtected.id,
          },
        });

      await prisma.user.delete({
        where: {
          id:
            existingProtected.id,
        },
      });
    }

    const protectedSuperAdmin =
      await prisma.user.create({
        data: {
          email: protectedEmail,

          /*
           * Ce compte cible ne se connecte jamais
           * pendant ce test.
           */
          passwordHash:
            'e2e-not-used',

          firstName:
            'E2E',
          lastName:
            'ProtectedSuperAdmin',

          role:
            'USER',

          platformRole:
            'SUPER_ADMIN',
        },
        select: {
          id: true,
          platformRole: true,
          status: true,
          authVersion: true,
        },
      });

    try {
      expect(
        protectedSuperAdmin.platformRole,
      ).toBe('SUPER_ADMIN');

      /*
       * On teste ici la hierarchie d'autorisation,
       * pas le throttling de /auth/login.
       *
       * AuthService.login reutilise la vraie logique
       * d'authentification et de creation des tokens,
       * mais sans traverser le ThrottlerGuard HTTP.
       */
      const authService =
        app.get(AuthService);

      const superAdminLogin =
        await authService.login({
          email:
            SUPER_ADMIN_EMAIL,
          password:
            ADMIN_PASSWORD,
        });

      const superAdminAccessToken:
        string =
        superAdminLogin.accessToken;

      /*
       * 1. Meme un SUPER_ADMIN ne peut pas
       * desactiver un autre SUPER_ADMIN
       * via la route administrative normale.
       */
      await request(app.getHttpServer())
        .patch(
          `/api/security/users/${protectedSuperAdmin.id}/status`,
        )
        .set(
          'Authorization',
          `Bearer ${superAdminAccessToken}`,
        )
        .send({
          status:
            'DISABLED',
          reason:
            'Tentative e2e interdite sur SUPER_ADMIN',
        })
        .expect(403);

      /*
       * 2. Meme principe pour la revocation
       * administrative de toutes les sessions.
       */
      await request(app.getHttpServer())
        .post(
          `/api/auth/users/${protectedSuperAdmin.id}/logout-all`,
        )
        .set(
          'Authorization',
          `Bearer ${superAdminAccessToken}`,
        )
        .expect(403);

      /*
       * Aucune des deux tentatives ne doit
       * modifier la cible.
       */
      const protectedAfter =
        await prisma.user
          .findUniqueOrThrow({
            where: {
              id:
                protectedSuperAdmin.id,
            },
            select: {
              platformRole: true,
              status: true,
              authVersion: true,
            },
          });

      expect(protectedAfter)
        .toEqual({
          platformRole:
            'SUPER_ADMIN',
          status:
            protectedSuperAdmin.status,
          authVersion:
            protectedSuperAdmin.authVersion,
        });

      /*
       * Une operation refusee ne doit produire
       * aucun faux audit de modification/revocation.
       */
      const forbiddenAuditCount =
        await prisma.securityAuditLog
          .count({
            where: {
              targetUserId:
                protectedSuperAdmin.id,
            },
          });

      expect(forbiddenAuditCount)
        .toBe(0);
    }
    finally {
      await prisma.securityAuditLog
        .deleteMany({
          where: {
            OR: [
              {
                actorId:
                  protectedSuperAdmin.id,
              },
              {
                targetUserId:
                  protectedSuperAdmin.id,
              },
            ],
          },
        });

      await prisma.refreshSession
        .deleteMany({
          where: {
            userId:
              protectedSuperAdmin.id,
          },
        });

      await prisma.user
        .deleteMany({
          where: {
            id:
              protectedSuperAdmin.id,
          },
        });
    }
  });
  afterAll(async () => {
    const testIds = [
      adminId,
      legacyAdminId,
      superAdminId,
      userId,
    ];

    await prisma.securityAuditLog.deleteMany({
      where: {
        OR: [
          {
            actorId: {
              in: testIds,
            },
          },
          {
            targetUserId: {
              in: testIds,
            },
          },
        ],
      },
    });

    await prisma.refreshSession.deleteMany({
      where: {
        userId: {
          in: testIds,
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: testIds,
        },
      },
    });

    await app.close();
  });
});