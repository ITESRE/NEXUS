import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationAction, ModerationTargetType } from '@prisma/client';

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  findDeletedPosts() {
    return this.prisma.post.findMany({
      where: {
        deletedAt: {
          not: null,
        },
      },
      orderBy: {
        deletedAt: 'desc',
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  findDeletedComments() {
    return this.prisma.comment.findMany({
      where: {
        deletedAt: {
          not: null,
        },
      },
      orderBy: {
        deletedAt: 'desc',
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        post: {
          select: {
            id: true,
            content: true,
            authorId: true,
            deletedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
  }

async restorePost(id: string, currentUser: any) {
  const post = await this.prisma.post.findUnique({
    where: { id },
  });

  if (!post) {
    throw new NotFoundException('Post introuvable');
  }

  if (!post.deletedAt) {
    throw new BadRequestException('Ce post est déjà actif');
  }

  return this.prisma.$transaction(async (tx) => {
    const restoredPost = await tx.post.update({
      where: { id },
      data: {
        deletedAt: null,
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    await tx.moderationLog.create({
      data: {
        action: ModerationAction.POST_RESTORE,
        targetType: ModerationTargetType.POST,
        targetId: id,
        moderatorId: currentUser.userId,
      },
    });

    return restoredPost;
  });
}

async restoreComment(id: string, currentUser: any) {
  const comment = await this.prisma.comment.findUnique({
    where: { id },
  });

  if (!comment) {
    throw new NotFoundException('Commentaire introuvable');
  }

  if (!comment.deletedAt) {
    throw new BadRequestException('Ce commentaire est déjà actif');
  }

  return this.prisma.$transaction(async (tx) => {
    const restoredComment = await tx.comment.update({
      where: { id },
      data: {
        deletedAt: null,
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        post: {
          select: {
            id: true,
            content: true,
            authorId: true,
            deletedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    await tx.moderationLog.create({
      data: {
        action: ModerationAction.COMMENT_RESTORE,
        targetType: ModerationTargetType.COMMENT,
        targetId: id,
        moderatorId: currentUser.userId,
      },
    });

    return restoredComment;
  });
}

}