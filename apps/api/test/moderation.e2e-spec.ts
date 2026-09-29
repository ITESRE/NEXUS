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

const USER_EMAIL =
  'e2e-moderation-user@nexus.local';

const MODERATOR_EMAIL =
  'e2e-moderator@nexus.local';

const ADMIN_EMAIL =
  'e2e-moderation-admin@nexus.local';

const CORE_ONLY_ADMIN_EMAIL =
  'e2e-core-only-admin@nexus.local';

const TEST_PASSWORD =
  'E2eModerationPassword123!';

describe('Moderation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let userId: string;
  let moderatorId: string;
  let adminId: string;
  let coreOnlyAdminId: string;

  let userAccessToken: string;
  let moderatorAccessToken: string;
  let adminAccessToken: string;
  let coreOnlyAdminAccessToken: string;

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
      CORE_ONLY_ADMIN_EMAIL,
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

    const passwordHash = await hashPassword(TEST_PASSWORD);

    const user =
      await prisma.user.create({
        data: {
          email: USER_EMAIL,
          passwordHash,
          firstName: 'E2E',
          lastName: 'ModerationUser',
          role: 'USER',
          socialProfile: {
            create: {
              role: 'USER',
            },
          },
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
          socialProfile: {
            create: {
              role: 'MODERATOR',
            },
          },
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
          socialProfile: {
            create: {
              role: 'ADMIN',
            },
          },
        },
      });

    const coreOnlyAdmin =
      await prisma.user.create({
        data: {
          email: CORE_ONLY_ADMIN_EMAIL,
          passwordHash,
          firstName: 'E2E',
          lastName: 'CoreOnlyAdmin',
          role: 'SUPER_ADMIN',
          platformRole: 'SUPER_ADMIN',
        },
      });

    userId = user.id;
    moderatorId = moderator.id;
    adminId = admin.id;
    coreOnlyAdminId =
      coreOnlyAdmin.id;

    const nexusSocialApplication =
      await prisma.application
        .findUniqueOrThrow({
          where: {
            key: 'NEXUS_SOCIAL',
          },
          select: {
            id: true,
          },
        });

    await prisma.userApplicationAccess
      .createMany({
        data: [
          {
            userId,
            applicationId:
              nexusSocialApplication.id,
          },
          {
            userId: moderatorId,
            applicationId:
              nexusSocialApplication.id,
          },
          {
            userId: adminId,
            applicationId:
              nexusSocialApplication.id,
          },
          {
            userId: coreOnlyAdminId,
            applicationId:
              nexusSocialApplication.id,
          },
        ],
        skipDuplicates: true,
      });
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

    const coreOnlyAdminLogin =
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: CORE_ONLY_ADMIN_EMAIL,
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

    expect([200, 201]).toContain(
      coreOnlyAdminLogin.status,
    );

    userAccessToken =
      userLogin.body.accessToken;

    moderatorAccessToken =
      moderatorLogin.body.accessToken;

    adminAccessToken =
      adminLogin.body.accessToken;

    coreOnlyAdminAccessToken =
      coreOnlyAdminLogin.body.accessToken;
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

  it('refuse un SUPER_ADMIN plateforme sans profil NEXUS Social', async () => {
    await request(app.getHttpServer())
      .get('/api/moderation/posts/deleted')
      .set(
        'Authorization',
        `Bearer ${coreOnlyAdminAccessToken}`,
      )
      .expect(403);

    await request(app.getHttpServer())
      .get(
        '/api/moderation/comments/deleted',
      )
      .set(
        'Authorization',
        `Bearer ${coreOnlyAdminAccessToken}`,
      )
      .expect(403);
  });

  it('revoque immediatement NEXUS Social sans supprimer le SocialProfile', async () => {
    const nexusSocialApplication =
      await prisma.application
        .findUniqueOrThrow({
          where: {
            key: 'NEXUS_SOCIAL',
          },
          select: {
            id: true,
          },
        });

    const socialProfileBefore =
      await prisma.socialProfile
        .findUnique({
          where: {
            userId: moderatorId,
          },
          select: {
            role: true,
          },
        });

    expect(socialProfileBefore)
      .toEqual({
        role: 'MODERATOR',
      });

    await prisma.userApplicationAccess
      .delete({
        where: {
          userId_applicationId: {
            userId: moderatorId,
            applicationId:
              nexusSocialApplication.id,
          },
        },
      });

    try {
      await request(app.getHttpServer())
        .get('/api/moderation/posts/deleted')
        .set(
          'Authorization',
          `Bearer ${moderatorAccessToken}`,
        )
        .expect(403);

      const socialProfileAfter =
        await prisma.socialProfile
          .findUnique({
            where: {
              userId: moderatorId,
            },
            select: {
              role: true,
            },
          });

      expect(socialProfileAfter)
        .toEqual({
          role: 'MODERATOR',
        });
    }
    finally {
      await prisma.userApplicationAccess
        .create({
          data: {
            userId: moderatorId,
            applicationId:
              nexusSocialApplication.id,
          },
        });
    }
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

  it('gere le cycle complet de suppression et restauration d un post', async () => {
  const postContent =
    'Post e2e pour test de moderation';

  // 1. USER crÃ©e un post

  const createResponse =
    await request(app.getHttpServer())
      .post('/api/posts')
      .set(
        'Authorization',
        `Bearer ${userAccessToken}`,
      )
      .send({
        content: postContent,
      });

  expect([200, 201]).toContain(
    createResponse.status,
  );

  const postId: string =
    createResponse.body.id;

  expect(postId)
    .toBeDefined();

  // 2. VÃ©rifier que le post est accessible

  await request(app.getHttpServer())
    .get(`/api/posts/${postId}`)
    .set(
      'Authorization',
      `Bearer ${userAccessToken}`,
    )
    .expect(200);

  // 3. MODERATOR supprime le post

  const deleteResponse =
    await request(app.getHttpServer())
      .delete(`/api/posts/${postId}`)
      .set(
        'Authorization',
        `Bearer ${moderatorAccessToken}`,
      );

  expect([200, 204]).toContain(
    deleteResponse.status,
  );

  // 4. Le dÃ©tail du post doit maintenant retourner 404

  await request(app.getHttpServer())
    .get(`/api/posts/${postId}`)
    .set(
      'Authorization',
      `Bearer ${userAccessToken}`,
    )
    .expect(404);

  // 5. Le post doit apparaÃ®tre dans la liste des supprimÃ©s

  const deletedPostsResponse =
    await request(app.getHttpServer())
      .get('/api/moderation/posts/deleted')
      .set(
        'Authorization',
        `Bearer ${moderatorAccessToken}`,
      )
      .expect(200);

  const deletedPosts =
    Array.isArray(deletedPostsResponse.body)
      ? deletedPostsResponse.body
      : deletedPostsResponse.body.posts;

  expect(
    deletedPosts.some(
      (post: { id: string }) =>
        post.id === postId,
    ),
  ).toBe(true);

  // 6. VÃ©rifier le log POST_DELETE

  const deleteLog =
    await prisma.moderationLog.findFirst({
      where: {
        action: 'POST_DELETE',
        targetType: 'POST',
        targetId: postId,
        moderatorId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

  expect(deleteLog)
    .not.toBeNull();

  // 7. MODERATOR restaure le post

  const restoreResponse =
    await request(app.getHttpServer())
      .patch(
        `/api/moderation/posts/${postId}/restore`,
      )
      .set(
        'Authorization',
        `Bearer ${moderatorAccessToken}`,
      );

  expect(restoreResponse.status)
    .toBe(200);

  // 8. Le post doit Ãªtre de nouveau accessible

  const restoredPostResponse =
    await request(app.getHttpServer())
      .get(`/api/posts/${postId}`)
      .set(
        'Authorization',
        `Bearer ${userAccessToken}`,
      )
      .expect(200);

  expect(restoredPostResponse.body.id)
    .toBe(postId);

  expect(restoredPostResponse.body.content)
    .toBe(postContent);

  // 9. Le post doit rÃ©apparaÃ®tre dans le feed

  const feedResponse =
    await request(app.getHttpServer())
      .get('/api/posts')
      .set(
        'Authorization',
        `Bearer ${userAccessToken}`,
      )
      .expect(200);

  const feedPosts =
    Array.isArray(feedResponse.body)
      ? feedResponse.body
      : feedResponse.body.posts;

  expect(
    feedPosts.some(
      (post: { id: string }) =>
        post.id === postId,
    ),
  ).toBe(true);

  // 10. VÃ©rifier le log POST_RESTORE

  const restoreLog =
    await prisma.moderationLog.findFirst({
      where: {
        action: 'POST_RESTORE',
        targetType: 'POST',
        targetId: postId,
        moderatorId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

  expect(restoreLog)
    .not.toBeNull();
});

it('gere le cycle complet de suppression et restauration d un commentaire', async () => {
  const postResponse =
    await request(app.getHttpServer())
      .post('/api/posts')
      .set(
        'Authorization',
        `Bearer ${userAccessToken}`,
      )
      .send({
        content:
          'Post e2e pour test de moderation commentaire',
      });

  expect([200, 201]).toContain(
    postResponse.status,
  );

  const postId: string =
    postResponse.body.id;

  const commentContent =
    'Commentaire e2e pour test de moderation';

  const commentResponse =
    await request(app.getHttpServer())
      .post(
        `/api/posts/${postId}/comments`,
      )
      .set(
        'Authorization',
        `Bearer ${userAccessToken}`,
      )
      .send({
        content: commentContent,
      });

  expect([200, 201]).toContain(
    commentResponse.status,
  );

  const commentId: string =
    commentResponse.body.id;

  expect(commentId)
    .toBeDefined();

  // VÃ©rifier prÃ©sence avant suppression

  const commentsBefore =
    await request(app.getHttpServer())
      .get(
        `/api/posts/${postId}/comments`,
      )
      .set(
        'Authorization',
        `Bearer ${userAccessToken}`,
      )
      .expect(200);

  expect(
    commentsBefore.body.some(
      (comment: { id: string }) =>
        comment.id === commentId,
    ),
  ).toBe(true);

  // MODERATOR supprime le commentaire

  const deleteResponse =
    await request(app.getHttpServer())
      .delete(
        `/api/comments/${commentId}`,
      )
      .set(
        'Authorization',
        `Bearer ${moderatorAccessToken}`,
      );

  expect([200, 204]).toContain(
    deleteResponse.status,
  );

  // Absent de la liste des commentaires

  const commentsAfterDelete =
    await request(app.getHttpServer())
      .get(
        `/api/posts/${postId}/comments`,
      )
      .set(
        'Authorization',
        `Bearer ${userAccessToken}`,
      )
      .expect(200);

  expect(
    commentsAfterDelete.body.some(
      (comment: { id: string }) =>
        comment.id === commentId,
    ),
  ).toBe(false);

  // Absent aussi du dÃ©tail du post

  const postDetailAfterDelete =
    await request(app.getHttpServer())
      .get(`/api/posts/${postId}`)
      .set(
        'Authorization',
        `Bearer ${userAccessToken}`,
      )
      .expect(200);

  expect(
    postDetailAfterDelete.body.comments.some(
      (comment: { id: string }) =>
        comment.id === commentId,
    ),
  ).toBe(false);

  // Visible cÃ´tÃ© modÃ©ration

  const deletedCommentsResponse =
    await request(app.getHttpServer())
      .get(
        '/api/moderation/comments/deleted',
      )
      .set(
        'Authorization',
        `Bearer ${moderatorAccessToken}`,
      )
      .expect(200);

  const deletedComments =
    Array.isArray(
      deletedCommentsResponse.body,
    )
      ? deletedCommentsResponse.body
      : deletedCommentsResponse.body.comments;

  expect(
    deletedComments.some(
      (comment: { id: string }) =>
        comment.id === commentId,
    ),
  ).toBe(true);

  // Audit COMMENT_DELETE

  const deleteLog =
    await prisma.moderationLog.findFirst({
      where: {
        action: 'COMMENT_DELETE',
        targetType: 'COMMENT',
        targetId: commentId,
        moderatorId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

  expect(deleteLog)
    .not.toBeNull();

  // Restaurer le commentaire

  const restoreResponse =
    await request(app.getHttpServer())
      .patch(
        `/api/moderation/comments/${commentId}/restore`,
      )
      .set(
        'Authorization',
        `Bearer ${moderatorAccessToken}`,
      );

  expect(restoreResponse.status)
    .toBe(200);

  // RÃ©apparition dans la liste

  const commentsAfterRestore =
    await request(app.getHttpServer())
      .get(
        `/api/posts/${postId}/comments`,
      )
      .set(
        'Authorization',
        `Bearer ${userAccessToken}`,
      )
      .expect(200);

  expect(
    commentsAfterRestore.body.some(
      (comment: { id: string }) =>
        comment.id === commentId,
    ),
  ).toBe(true);

  // RÃ©apparition dans le dÃ©tail du post

  const postDetailAfterRestore =
    await request(app.getHttpServer())
      .get(`/api/posts/${postId}`)
      .set(
        'Authorization',
        `Bearer ${userAccessToken}`,
      )
      .expect(200);

  expect(
    postDetailAfterRestore.body.comments.some(
      (comment: { id: string }) =>
        comment.id === commentId,
    ),
  ).toBe(true);

  // Audit COMMENT_RESTORE

  const restoreLog =
    await prisma.moderationLog.findFirst({
      where: {
        action: 'COMMENT_RESTORE',
        targetType: 'COMMENT',
        targetId: commentId,
        moderatorId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

  expect(restoreLog)
    .not.toBeNull();
});

  afterAll(async () => {
    await prisma.moderationLog.deleteMany({
      where: {
        moderatorId: {
          in: [
            userId,
            moderatorId,
            adminId,
            coreOnlyAdminId,
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
                coreOnlyAdminId,
              ],
            },
          },
          {
            targetUserId: {
              in: [
                userId,
                moderatorId,
                adminId,
                coreOnlyAdminId,
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
            coreOnlyAdminId,
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
            coreOnlyAdminId,
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
            coreOnlyAdminId,
          ],
        },
      },
    });

    await app.close();
  });
});