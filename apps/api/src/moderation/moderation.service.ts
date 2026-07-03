import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

  async restorePost(id: string) {
  const post = await this.prisma.post.findUnique({
    where: { id },
  });

  if (!post) {
    throw new NotFoundException('Post introuvable');
  }

  if (!post.deletedAt) {
    throw new BadRequestException('Ce post est déjà actif');
  }

  return this.prisma.post.update({
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
}

async restoreComment(id: string) {
  const comment = await this.prisma.comment.findUnique({
    where: { id },
  });

  if (!comment) {
    throw new NotFoundException('Commentaire introuvable');
  }

  if (!comment.deletedAt) {
    throw new BadRequestException('Ce commentaire est déjà actif');
  }

  return this.prisma.comment.update({
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
}

}