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
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

type CurrentSocialUser = {
  userId: string;
  socialRole: SocialRole;
};

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  create(
    authorId: string,
    createPostDto: CreatePostDto,
  ) {
    return this.prisma.post.create({
      data: {
        content: createPostDto.content,
        authorId,
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

  findAll() {
    return this.prisma.post.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
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
        _count: {
          select: {
            comments: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    });
  }

  async findOne(
    id: string,
  ) {
    const post =
      await this.prisma.post.findFirst({
        where: {
          id,
          deletedAt: null,
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
          comments: {
            where: {
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
          },
        },
      });

    if (!post) {
      throw new NotFoundException(
        'Publication introuvable',
      );
    }

    return post;
  }

  async softDelete(
    id: string,
    currentUser: CurrentSocialUser,
  ) {
    const post =
      await this.prisma.post.findFirst({
        where: {
          id,
          deletedAt: null,
        },
        select: {
          id: true,
          authorId: true,
        },
      });

    if (!post) {
      throw new NotFoundException(
        'Publication introuvable',
      );
    }

    const isOwner =
      post.authorId ===
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
        const deletedPost =
          await tx.post.update({
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
              ModerationAction.POST_DELETE,
            targetType:
              ModerationTargetType.POST,
            targetId: id,
            moderatorId:
              currentUser.userId,
          },
        });

        return deletedPost;
      },
    );
  }

  async update(
    id: string,
    updatePostDto: UpdatePostDto,
    currentUser: CurrentSocialUser,
  ) {
    const post =
      await this.prisma.post.findFirst({
        where: {
          id,
          deletedAt: null,
        },
      });

    if (!post) {
      throw new NotFoundException(
        'Post introuvable',
      );
    }

    const isOwner =
      post.authorId ===
      currentUser.userId;

    const isSocialAdmin =
      currentUser.socialRole ===
      SocialRole.ADMIN;

    if (
      !isOwner &&
      !isSocialAdmin
    ) {
      throw new ForbiddenException(
        'Vous n’êtes pas autorisé à modifier ce post',
      );
    }

    const isPrivilegedEdit =
      !isOwner &&
      isSocialAdmin;

    return this.prisma.$transaction(
      async (tx) => {
        const updatedPost =
          await tx.post.update({
            where: {
              id,
            },
            data: {
              content:
                updatePostDto.content,
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
                ModerationAction.POST_UPDATE,
              targetType:
                ModerationTargetType.POST,
              targetId: id,
              moderatorId:
                currentUser.userId,
            },
          });
        }

        return updatedPost;
      },
    );
  }
}