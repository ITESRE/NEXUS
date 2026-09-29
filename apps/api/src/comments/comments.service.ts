import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ModerationAction,
  ModerationTargetType,
  SocialRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

type CurrentSocialUser = {
  userId: string;
  socialRole: SocialRole;
};

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(
    postId: string,
    authorId: string,
    createCommentDto:
      CreateCommentDto,
  ) {
    const post =
      await this.prisma.post.findFirst({
        where: {
          id: postId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

    if (!post) {
      throw new NotFoundException(
        'Publication introuvable',
      );
    }

    return this.prisma.comment.create({
      data: {
        content:
          createCommentDto.content,
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

  async findByPost(
    postId: string,
  ) {
    const post =
      await this.prisma.post.findFirst({
        where: {
          id: postId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

    if (!post) {
      throw new NotFoundException(
        'Publication introuvable',
      );
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

  async softDelete(
    id: string,
    currentUser: CurrentSocialUser,
  ) {
    const comment =
      await this.prisma.comment.findFirst({
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

    if (
      !comment ||
      comment.post.deletedAt
    ) {
      throw new NotFoundException(
        'Commentaire introuvable',
      );
    }

    const isOwner =
      comment.authorId ===
      currentUser.userId;

    const canModerate =
      currentUser.socialRole ===
        SocialRole.MODERATOR ||
      currentUser.socialRole ===
        SocialRole.ADMIN;

    if (
      !isOwner &&
      !canModerate
    ) {
      throw new ForbiddenException(
        'Accès interdit',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const deletedComment =
          await tx.comment.update({
            where: {
              id,
            },
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
            action:
              ModerationAction.COMMENT_DELETE,
            targetType:
              ModerationTargetType.COMMENT,
            targetId: id,
            moderatorId:
              currentUser.userId,
          },
        });

        return deletedComment;
      },
    );
  }

  async update(
    id: string,
    updateCommentDto:
      UpdateCommentDto,
    currentUser: CurrentSocialUser,
  ) {
    const comment =
      await this.prisma.comment.findFirst({
        where: {
          id,
          deletedAt: null,
        },
      });

    if (!comment) {
      throw new NotFoundException(
        'Commentaire introuvable',
      );
    }

    const isOwner =
      comment.authorId ===
      currentUser.userId;

    const isSocialAdmin =
      currentUser.socialRole ===
      SocialRole.ADMIN;

    if (
      !isOwner &&
      !isSocialAdmin
    ) {
      throw new ForbiddenException(
        'Vous n’êtes pas autorisé à modifier ce commentaire',
      );
    }

    const isPrivilegedEdit =
      !isOwner &&
      isSocialAdmin;

    return this.prisma.$transaction(
      async (tx) => {
        const updatedComment =
          await tx.comment.update({
            where: {
              id,
            },
            data: {
              content:
                updateCommentDto.content,
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

        if (isPrivilegedEdit) {
          await tx.moderationLog.create({
            data: {
              action:
                ModerationAction.COMMENT_UPDATE,
              targetType:
                ModerationTargetType.COMMENT,
              targetId: id,
              moderatorId:
                currentUser.userId,
            },
          });
        }

        return updatedComment;
      },
    );
  }
}