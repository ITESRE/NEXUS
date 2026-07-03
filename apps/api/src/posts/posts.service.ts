import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  create(authorId: string, createPostDto: CreatePostDto) {
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
            comments: true,
          },
        },
      },
    });
  }

   async findOne(id: string) {
    const post = await this.prisma.post.findFirst({
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
        throw new NotFoundException('Publication introuvable');
    }

    return post;
    }
}