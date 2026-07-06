import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { ModerationAction, ModerationTargetType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

type CurrentUser = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
};

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    postId: string,
    authorId: string,
    createCommentDto: CreateCommentDto,
  ) {
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!post) {
      throw new NotFoundException('Publication introuvable');
    }

    return this.prisma.comment.create({
      data: {
        content: createCommentDto.content,
        postId,
        authorId,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        postId: true,
        author: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
          },
        },
      },
    });
  }

  async findByPost(postId: string) {
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!post) {
      throw new NotFoundException('Publication introuvable');
    }

    return this.prisma.comment.findMany({
      where: {
        postId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
          },
        },
      },
    });
  }

  async softDelete(id: string, currentUser: CurrentUser) {
    const comment = await this.prisma.comment.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        authorId: true,
        post: {
          select: {
            deletedAt: true,
          },
        },
      },
    });

    if (!comment || comment.post.deletedAt) {
      throw new NotFoundException('Commentaire introuvable');
    }

    const isOwner = comment.authorId === currentUser.userId;

    const canModerate =
      currentUser.role === UserRole.MODERATOR ||
      currentUser.role === UserRole.ADMIN ||
      currentUser.role === UserRole.SUPER_ADMIN;

    if (!isOwner && !canModerate) {
      throw new ForbiddenException('Accès interdit');
    }

    return this.prisma.$transaction(async (tx) => {
      const deletedComment = await tx.comment.update({
        where: { id },
        data: {
          deletedAt: new Date(),
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
          action: ModerationAction.COMMENT_DELETE,
          targetType: ModerationTargetType.COMMENT,
          targetId: id,
          moderatorId: currentUser.userId,
        },
      });

      return deletedComment;
    });
  }

async update(id: string, updateCommentDto: UpdateCommentDto, currentUser: any) {
  const comment = await this.prisma.comment.findFirst({
    where: {
      id,
      deletedAt: null,
    },
  });

  if (!comment) {
    throw new NotFoundException('Commentaire introuvable');
  }

  if (comment.authorId !== currentUser.userId) {
    throw new ForbiddenException('Vous ne pouvez modifier que vos propres commentaires');
  }

  return this.prisma.comment.update({
    where: { id },
    data: {
      content: updateCommentDto.content,
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

}