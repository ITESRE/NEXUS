import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PlatformRole,
  SecurityAction,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ApplicationAdminActor = {
  userId: string;
  platformRole: PlatformRole;
};

@Injectable()
export class ApplicationAdminService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async findAllApplications() {
    return this.prisma.application.findMany({
      select: {
        key: true,
        name: true,
        description: true,
        enabled: true,
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

  async findApplicationsForUser(
    userId: string,
  ) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          id: true,
          platformRole: true,
          status: true,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'Utilisateur introuvable',
      );
    }

    const applications =
      await this.prisma.application
        .findMany({
          select: {
            key: true,
            name: true,
            description: true,
            enabled: true,
            sortOrder: true,

            accesses: {
              where: {
                userId,
              },
              select: {
                createdAt: true,
              },
              take: 1,
            },
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

    return {
      user,
      applications:
        applications.map(
          ({
            accesses,
            ...application
          }) => ({
            ...application,

            hasAccess:
              accesses.length > 0,

            grantedAt:
              accesses[0]?.createdAt ??
              null,
          }),
        ),
    };
  }

  async grantAccess(
    userId: string,
    applicationKey: string,
    actor: ApplicationAdminActor,
  ) {
    this.assertSuperAdmin(actor);

    return this.prisma.$transaction(
      async (tx) => {
        const targetUser =
          await tx.user.findUnique({
            where: {
              id: userId,
            },
            select: {
              id: true,
              platformRole: true,
            },
          });

        if (!targetUser) {
          throw new NotFoundException(
            'Utilisateur introuvable',
          );
        }

        /*
         * Les SUPER_ADMIN sont hors du cycle
         * normal d'administration.
         */
        if (
          targetUser.platformRole ===
          PlatformRole.SUPER_ADMIN
        ) {
          throw new ForbiddenException(
            'Les acces applicatifs d’un SUPER_ADMIN ne peuvent pas etre modifies par cette route',
          );
        }

        const application =
          await tx.application.findUnique({
            where: {
              key: applicationKey,
            },
            select: {
              id: true,
              key: true,
              name: true,
              enabled: true,
            },
          });

        if (!application) {
          throw new NotFoundException(
            'Application introuvable',
          );
        }

        /*
         * createMany + skipDuplicates rend
         * l'attribution idempotente.
         *
         * Un doublon ne produit donc
         * aucun faux audit.
         */
        const created =
          await tx.userApplicationAccess
            .createMany({
              data: [
                {
                  userId,
                  applicationId:
                    application.id,
                },
              ],
              skipDuplicates: true,
            });

        const changed =
          created.count === 1;

        if (changed) {
          await tx.securityAuditLog.create({
            data: {
              action:
                SecurityAction
                  .USER_APPLICATION_ACCESS_GRANTED,

              actorId:
                actor.userId,

              targetUserId:
                userId,

              applicationKey:
                application.key,
            },
          });
        }

        return {
          changed,
          userId,

          application: {
            key:
              application.key,
            name:
              application.name,
            enabled:
              application.enabled,
          },

          hasAccess: true,
        };
      },
    );
  }

  async revokeAccess(
    userId: string,
    applicationKey: string,
    actor: ApplicationAdminActor,
  ) {
    this.assertSuperAdmin(actor);

    return this.prisma.$transaction(
      async (tx) => {
        const targetUser =
          await tx.user.findUnique({
            where: {
              id: userId,
            },
            select: {
              id: true,
              platformRole: true,
            },
          });

        if (!targetUser) {
          throw new NotFoundException(
            'Utilisateur introuvable',
          );
        }

        if (
          targetUser.platformRole ===
          PlatformRole.SUPER_ADMIN
        ) {
          throw new ForbiddenException(
            'Les acces applicatifs d’un SUPER_ADMIN ne peuvent pas etre modifies par cette route',
          );
        }

        const application =
          await tx.application.findUnique({
            where: {
              key: applicationKey,
            },
            select: {
              id: true,
              key: true,
              name: true,
              enabled: true,
            },
          });

        if (!application) {
          throw new NotFoundException(
            'Application introuvable',
          );
        }

        /*
         * deleteMany rend egalement
         * la revocation idempotente.
         */
        const deleted =
          await tx.userApplicationAccess
            .deleteMany({
              where: {
                userId,
                applicationId:
                  application.id,
              },
            });

        const changed =
          deleted.count > 0;

        if (changed) {
          await tx.securityAuditLog.create({
            data: {
              action:
                SecurityAction
                  .USER_APPLICATION_ACCESS_REVOKED,

              actorId:
                actor.userId,

              targetUserId:
                userId,

              applicationKey:
                application.key,
            },
          });
        }

        return {
          changed,
          userId,

          application: {
            key:
              application.key,
            name:
              application.name,
            enabled:
              application.enabled,
          },

          hasAccess: false,
        };
      },
    );
  }

  private assertSuperAdmin(
    actor: ApplicationAdminActor,
  ) {
    if (
      actor.platformRole !==
      PlatformRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Seul un SUPER_ADMIN peut modifier les acces applicatifs',
      );
    }
  }
}