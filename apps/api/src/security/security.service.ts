import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PlatformRole,
  SecurityAction,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateUserStatusDto,
} from './dto/update-user-status.dto';
import {
  UpdateUserPlatformRoleDto,
} from './dto/update-user-platform-role.dto';

type PlatformActor = {
  userId: string;
  platformRole: PlatformRole;
};

@Injectable()
export class SecurityService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  findAuditLogs() {
    return this.prisma
      .securityAuditLog
      .findMany({
        orderBy: {
          createdAt: 'desc',
        },
        take: 100,
        select: {
          id: true,
          action: true,
          reason: true,

          previousStatus: true,
          newStatus: true,

          // Historique legacy
          previousRole: true,
          newRole: true,

          // Audit plateforme
          previousPlatformRole: true,
          newPlatformRole: true,

          createdAt: true,

          actor: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,

              // Legacy temporaire
              role: true,

              platformRole: true,
              status: true,
            },
          },

          targetUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,

              // Legacy temporaire
              role: true,

              platformRole: true,
              status: true,
            },
          },
        },
      });
  }

  async updateUserStatus(
    userId: string,
    actor: PlatformActor,
    updateUserStatusDto:
      UpdateUserStatusDto,
  ) {
    if (
      actor.userId ===
      userId
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier votre propre statut',
      );
    }

    if (
      actor.platformRole !==
        PlatformRole.ADMIN &&
      actor.platformRole !==
        PlatformRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Vous n’êtes pas autorisé à modifier le statut de ce compte',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const targetUser =
          await tx.user.findUnique({
            where: {
              id: userId,
            },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,

              // Legacy temporaire
              role: true,

              platformRole: true,
              status: true,
            },
          });

        if (!targetUser) {
          throw new NotFoundException(
            'Utilisateur introuvable',
          );
        }

        /*
         * ADMIN ne peut administrer
         * que PlatformRole.USER.
         */
        if (
          actor.platformRole ===
            PlatformRole.ADMIN &&
          targetUser.platformRole !==
            PlatformRole.USER
        ) {
          throw new ForbiddenException(
            'Un ADMIN ne peut modifier que le statut d’un compte USER',
          );
        }

        if (
          targetUser.status ===
          updateUserStatusDto.status
        ) {
          throw new BadRequestException(
            'Ce compte possède déjà ce statut',
          );
        }

        const now =
          new Date();

        const updatedUser =
          await tx.user.update({
            where: {
              id: userId,
            },
            data: {
              status:
                updateUserStatusDto.status,
              authVersion: {
                increment: 1,
              },
            },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              platformRole: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          });

        let revokedSessions =
          0;

        if (
          updateUserStatusDto.status ===
          UserStatus.DISABLED
        ) {
          const result =
            await tx.refreshSession
              .updateMany({
                where: {
                  userId,
                  revokedAt: null,
                },
                data: {
                  revokedAt: now,
                  lastUsedAt: now,
                },
              });

          revokedSessions =
            result.count;
        }

        await tx.securityAuditLog
          .create({
            data: {
              action:
                SecurityAction.USER_STATUS_CHANGED,
              actorId:
                actor.userId,
              targetUserId:
                userId,
              reason:
                updateUserStatusDto.reason,
              previousStatus:
                targetUser.status,
              newStatus:
                updateUserStatusDto.status,
            },
          });

        return {
          message:
            'Statut utilisateur mis à jour',
          revokedSessions,
          user:
            updatedUser,
        };
      },
    );
  }

  async updateUserPlatformRole(
    userId: string,
    actor: PlatformActor,
    updateUserPlatformRoleDto:
      UpdateUserPlatformRoleDto,
  ) {
    if (
      actor.userId ===
      userId
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier votre propre rôle plateforme',
      );
    }

    /*
     * Défense en profondeur :
     * le controller le vérifie déjà,
     * mais le service ne fait pas
     * confiance à son appelant.
     */
    if (
      actor.platformRole !==
      PlatformRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Seul un SUPER_ADMIN peut modifier les rôles plateforme',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const targetUser =
          await tx.user.findUnique({
            where: {
              id: userId,
            },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,

              // Legacy : jamais modifié ici.
              role: true,

              platformRole: true,
              status: true,
            },
          });

        if (!targetUser) {
          throw new NotFoundException(
            'Utilisateur introuvable',
          );
        }

        /*
         * Les SUPER_ADMIN sont hors
         * du cycle normal de délégation.
         */
        if (
          targetUser.platformRole ===
          PlatformRole.SUPER_ADMIN
        ) {
          throw new ForbiddenException(
            'Le rôle plateforme d’un SUPER_ADMIN ne peut pas être modifié par cette route',
          );
        }

        if (
          updateUserPlatformRoleDto
            .platformRole ===
          PlatformRole.SUPER_ADMIN
        ) {
          throw new ForbiddenException(
            'Le rôle SUPER_ADMIN ne peut pas être attribué par cette route',
          );
        }

        if (
          targetUser.platformRole ===
          updateUserPlatformRoleDto
            .platformRole
        ) {
          throw new BadRequestException(
            'Cet utilisateur possède déjà ce rôle plateforme',
          );
        }

        const now =
          new Date();

        /*
         * Update conditionnel :
         * évite d’écraser une modification
         * concurrente du même rôle.
         */
        const roleUpdate =
          await tx.user.updateMany({
            where: {
              id: userId,
              platformRole:
                targetUser.platformRole,
            },
            data: {
              platformRole:
                updateUserPlatformRoleDto
                  .platformRole,
              authVersion: {
                increment: 1,
              },
            },
          });

        if (
          roleUpdate.count !== 1
        ) {
          throw new ConflictException(
            'Le rôle plateforme a été modifié par une autre opération. Réessayez.',
          );
        }

        const sessionRevocation =
          await tx.refreshSession
            .updateMany({
              where: {
                userId,
                revokedAt: null,
              },
              data: {
                revokedAt: now,
                lastUsedAt: now,
              },
            });

        await tx.securityAuditLog
          .create({
            data: {
              action:
                SecurityAction.USER_PLATFORM_ROLE_CHANGED,
              actorId:
                actor.userId,
              targetUserId:
                userId,
              reason:
                updateUserPlatformRoleDto
                  .reason,
              previousPlatformRole:
                targetUser.platformRole,
              newPlatformRole:
                updateUserPlatformRoleDto
                  .platformRole,
            },
          });

        const updatedUser =
          await tx.user.findUnique({
            where: {
              id: userId,
            },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,

              // Doit rester inchangé.
              role: true,

              platformRole: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          });

        return {
          message:
            'Rôle plateforme mis à jour',
          revokedSessions:
            sessionRevocation.count,
          user:
            updatedUser,
        };
      },
    );
  }
}