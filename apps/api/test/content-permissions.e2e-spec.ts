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
import * as argon2 from 'argon2';

import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

const AUTHOR_EMAIL =
  'e2e-content-author@nexus.local';

const OTHER_USER_EMAIL =
  'e2e-content-other@nexus.local';

const MODERATOR_EMAIL =
  'e2e-content-moderator@nexus.local';

const ADMIN_EMAIL =
  'e2e-content-admin@nexus.local';

const TEST_PASSWORD =
  'E2eContentPassword123!';

describe('Permissions de modification des contenus (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let authorId: string;
  let otherUserId: string;
  let moderatorId: string;
  let adminId: string;

  let authorAccessToken: string;
  let otherUserAccessToken: string;
  let moderatorAccessToken: string;
  let adminAccessToken: string;

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
      AUTHOR_EMAIL,
      OTHER_USER_EMAIL,
      MODERATOR_EMAIL,
      ADMIN_EMAIL,
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

    const passwordHash =
      await argon2.hash(
        TEST_PASSWORD,
        {
          type: argon2.argon2id,
          memoryCost: 19456,
          timeCost: 2,
          parallelism: 1,
        },
      );

    const author =
      await prisma.user.create({
        data: {
          email: AUTHOR_EMAIL,
          passwordHash,
          firstName: 'E2E',
          lastName: 'Author',
          role: 'USER',
        },
      });

    const otherUser =
      await prisma.user.create({
        data: {
          email: OTHER_USER_EMAIL,
          passwordHash,
          firstName: 'E2E',
          lastName: 'OtherUser',
          role: 'USER',
        },
      });

    const moderator =
      await prisma.user.create({
        data: {
          email: MODERATOR_EMAIL,
          passwordHash,
          firstName: 'E2E',
          lastName: 'ContentModerator',
          role: 'MODERATOR',
        },
      });

    const admin =
      await prisma.user.create({
        data: {
          email: ADMIN_EMAIL,
          passwordHash,
          firstName: 'E2E',
          lastName: 'ContentAdmin',
          role: 'ADMIN',
        },
      });

    authorId = author.id;
    otherUserId = otherUser.id;
    moderatorId = moderator.id;
    adminId = admin.id;

    const authorLogin =
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: AUTHOR_EMAIL,
          password: TEST_PASSWORD,
        });

    const otherUserLogin =
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: OTHER_USER_EMAIL,
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

    expect([200, 201]).toContain(
      authorLogin.status,
    );

    expect([200, 201]).toContain(
      otherUserLogin.status,
    );

    expect([200, 201]).toContain(
      moderatorLogin.status,
    );

    expect([200, 201]).toContain(
      adminLogin.status,
    );

    authorAccessToken =
      authorLogin.body.accessToken;

    otherUserAccessToken =
      otherUserLogin.body.accessToken;

    moderatorAccessToken =
      moderatorLogin.body.accessToken;

    adminAccessToken =
      adminLogin.body.accessToken;
  });

  it('applique correctement les droits de modification d un post et l audit ADMIN', async () => {
    const createResponse =
      await request(app.getHttpServer())
        .post('/api/posts')
        .set(
          'Authorization',
          `Bearer ${authorAccessToken}`,
        )
        .send({
          content:
            'Post initial pour test des permissions',
        });

    expect([200, 201]).toContain(
      createResponse.status,
    );

    const postId: string =
      createResponse.body.id;

    expect(postId)
      .toBeDefined();

    // Nombre de logs avant modification par l'auteur

    const authorUpdateLogsBefore =
      await prisma.moderationLog.count({
        where: {
          action: 'POST_UPDATE',
          targetType: 'POST',
          targetId: postId,
        },
      });

    // AUTHOR peut modifier son propre post

    const authorUpdateResponse =
      await request(app.getHttpServer())
        .patch(`/api/posts/${postId}`)
        .set(
          'Authorization',
          `Bearer ${authorAccessToken}`,
        )
        .send({
          content:
            'Post modifie par son auteur',
        });

    expect(authorUpdateResponse.status)
      .toBe(200);

    expect(
      authorUpdateResponse.body.content,
    ).toBe(
      'Post modifie par son auteur',
    );

    // Aucun audit POST_UPDATE pour l'auteur

    const authorUpdateLogsAfter =
      await prisma.moderationLog.count({
        where: {
          action: 'POST_UPDATE',
          targetType: 'POST',
          targetId: postId,
        },
      });

    expect(authorUpdateLogsAfter)
      .toBe(authorUpdateLogsBefore);

    // OTHER USER ne peut pas modifier

    await request(app.getHttpServer())
      .patch(`/api/posts/${postId}`)
      .set(
        'Authorization',
        `Bearer ${otherUserAccessToken}`,
      )
      .send({
        content:
          'Tentative de modification par autre USER',
      })
      .expect(403);

    // MODERATOR ne peut pas réécrire le contenu d'autrui

    await request(app.getHttpServer())
      .patch(`/api/posts/${postId}`)
      .set(
        'Authorization',
        `Bearer ${moderatorAccessToken}`,
      )
      .send({
        content:
          'Tentative de modification par MODERATOR',
      })
      .expect(403);

    // ADMIN peut modifier le post d'autrui

    const adminUpdateResponse =
      await request(app.getHttpServer())
        .patch(`/api/posts/${postId}`)
        .set(
          'Authorization',
          `Bearer ${adminAccessToken}`,
        )
        .send({
          content:
            'Post modifie par ADMIN',
        });

    expect(adminUpdateResponse.status)
      .toBe(200);

    expect(
      adminUpdateResponse.body.content,
    ).toBe(
      'Post modifie par ADMIN',
    );

    // Vérifier que le contenu final est bien celui de l'ADMIN

    const postDetail =
      await request(app.getHttpServer())
        .get(`/api/posts/${postId}`)
        .set(
          'Authorization',
          `Bearer ${authorAccessToken}`,
        )
        .expect(200);

    expect(postDetail.body.content)
      .toBe(
        'Post modifie par ADMIN',
      );

    // Vérifier l'audit POST_UPDATE

    const adminUpdateLog =
      await prisma.moderationLog.findFirst({
        where: {
          action: 'POST_UPDATE',
          targetType: 'POST',
          targetId: postId,
          moderatorId: adminId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    expect(adminUpdateLog)
      .not.toBeNull();

    expect(adminUpdateLog?.moderatorId)
      .toBe(adminId);

    expect(adminUpdateLog?.action)
      .toBe('POST_UPDATE');
  });

  it('applique correctement les droits de modification d un commentaire et l audit ADMIN', async () => {
  // 1. AUTHOR crée un post

  const postResponse =
    await request(app.getHttpServer())
      .post('/api/posts')
      .set(
        'Authorization',
        `Bearer ${authorAccessToken}`,
      )
      .send({
        content:
          'Post support du test de permissions commentaire',
      });

  expect([200, 201]).toContain(
    postResponse.status,
  );

  const postId: string =
    postResponse.body.id;

  expect(postId)
    .toBeDefined();

  // 2. AUTHOR crée un commentaire

  const commentResponse =
    await request(app.getHttpServer())
      .post(
        `/api/posts/${postId}/comments`,
      )
      .set(
        'Authorization',
        `Bearer ${authorAccessToken}`,
      )
      .send({
        content:
          'Commentaire initial pour test des permissions',
      });

  expect([200, 201]).toContain(
    commentResponse.status,
  );

  const commentId: string =
    commentResponse.body.id;

  expect(commentId)
    .toBeDefined();

  // 3. Compter les logs COMMENT_UPDATE avant modification auteur

  const authorUpdateLogsBefore =
    await prisma.moderationLog.count({
      where: {
        action: 'COMMENT_UPDATE',
        targetType: 'COMMENT',
        targetId: commentId,
      },
    });

  // 4. AUTHOR modifie son propre commentaire

  const authorUpdateResponse =
    await request(app.getHttpServer())
      .patch(
        `/api/comments/${commentId}`,
      )
      .set(
        'Authorization',
        `Bearer ${authorAccessToken}`,
      )
      .send({
        content:
          'Commentaire modifie par son auteur',
      });

  expect(authorUpdateResponse.status)
    .toBe(200);

  expect(
    authorUpdateResponse.body.content,
  ).toBe(
    'Commentaire modifie par son auteur',
  );

  // 5. Vérifier qu'aucun audit COMMENT_UPDATE
  // n'a été créé pour la modification par l'auteur

  const authorUpdateLogsAfter =
    await prisma.moderationLog.count({
      where: {
        action: 'COMMENT_UPDATE',
        targetType: 'COMMENT',
        targetId: commentId,
      },
    });

  expect(authorUpdateLogsAfter)
    .toBe(authorUpdateLogsBefore);

  // 6. OTHER USER ne peut pas modifier le commentaire

  await request(app.getHttpServer())
    .patch(
      `/api/comments/${commentId}`,
    )
    .set(
      'Authorization',
      `Bearer ${otherUserAccessToken}`,
    )
    .send({
      content:
        'Tentative de modification par autre USER',
    })
    .expect(403);

  // 7. MODERATOR ne peut pas réécrire
  // le commentaire d'un autre utilisateur

  await request(app.getHttpServer())
    .patch(
      `/api/comments/${commentId}`,
    )
    .set(
      'Authorization',
      `Bearer ${moderatorAccessToken}`,
    )
    .send({
      content:
        'Tentative de modification par MODERATOR',
    })
    .expect(403);

  // 8. ADMIN peut modifier le commentaire d'autrui

  const adminUpdateResponse =
    await request(app.getHttpServer())
      .patch(
        `/api/comments/${commentId}`,
      )
      .set(
        'Authorization',
        `Bearer ${adminAccessToken}`,
      )
      .send({
        content:
          'Commentaire modifie par ADMIN',
      });

  expect(adminUpdateResponse.status)
    .toBe(200);

  expect(
    adminUpdateResponse.body.content,
  ).toBe(
    'Commentaire modifie par ADMIN',
  );

  // 9. Vérifier le contenu final via GET comments

  const commentsResponse =
    await request(app.getHttpServer())
      .get(
        `/api/posts/${postId}/comments`,
      )
      .set(
        'Authorization',
        `Bearer ${authorAccessToken}`,
      )
      .expect(200);

  const updatedComment =
    commentsResponse.body.find(
      (comment: { id: string }) =>
        comment.id === commentId,
    );

  expect(updatedComment)
    .toBeDefined();

  expect(updatedComment.content)
    .toBe(
      'Commentaire modifie par ADMIN',
    );

  // 10. Vérifier le log COMMENT_UPDATE

  const adminUpdateLog =
    await prisma.moderationLog.findFirst({
      where: {
        action: 'COMMENT_UPDATE',
        targetType: 'COMMENT',
        targetId: commentId,
        moderatorId: adminId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

  expect(adminUpdateLog)
    .not.toBeNull();

  expect(adminUpdateLog?.moderatorId)
    .toBe(adminId);

  expect(adminUpdateLog?.action)
    .toBe('COMMENT_UPDATE');
});

  afterAll(async () => {
    await prisma.moderationLog.deleteMany({
      where: {
        moderatorId: {
          in: [
            authorId,
            otherUserId,
            moderatorId,
            adminId,
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
                authorId,
                otherUserId,
                moderatorId,
                adminId,
              ],
            },
          },
          {
            targetUserId: {
              in: [
                authorId,
                otherUserId,
                moderatorId,
                adminId,
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
            authorId,
            otherUserId,
            moderatorId,
            adminId,
          ],
        },
      },
    });

    await prisma.post.deleteMany({
      where: {
        authorId: {
          in: [
            authorId,
            otherUserId,
            moderatorId,
            adminId,
          ],
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            authorId,
            otherUserId,
            moderatorId,
            adminId,
          ],
        },
      },
    });

    await app.close();
  });
});