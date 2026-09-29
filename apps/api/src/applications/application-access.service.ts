import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApplicationAccessService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async findEnabledApplicationsForUser(
    userId: string,
  ) {
    return this.prisma.application.findMany({
      where: {
        enabled: true,
        accesses: {
          some: {
            userId,
          },
        },
      },
      select: {
        key: true,
        name: true,
        description: true,
        sortOrder: true,
      },
      orderBy: [
        {
          sortOrder: 'asc',
        },
        {
          name: 'asc',
        },
      ],
    });
  }

  async hasAccess(
    userId: string,
    applicationKey: string,
  ): Promise<boolean> {
    const access =
      await this.prisma
        .userApplicationAccess
        .findFirst({
          where: {
            userId,
            application: {
              key: applicationKey,
              enabled: true,
            },
          },
          select: {
            userId: true,
          },
        });

    return access !== null;
  }
}