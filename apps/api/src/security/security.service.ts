import { BadRequestException, ForbiddenException, Injectable, NotFoundException, } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityAction, UserRole, UserStatus, } from '@prisma/client';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@Injectable()
export class SecurityService {
  constructor(private readonly prisma: PrismaService) {}

  findAuditLogs() {
    return this.prisma.securityAuditLog.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
      select: {
        id: true,
        action: true,
        reason: true,
        createdAt: true,

        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
          },
        },

        targetUser: {
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

  async updateUserStatus(
  userId: string,
  actor: {
    userId: string;
    role: UserRole;
  },
  updateUserStatusDto: UpdateUserStatusDto,
) {
  if (actor.userId === userId) {
    throw new ForbiddenException(
      'Vous ne pouvez pas modifier votre propre statut',
    );
  }

  return this.prisma.$transaction(async (tx) => {
    const targetUser = await tx.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundException(
        'Utilisateur introuvable',
      );
    }

    if (
      actor.role === UserRole.ADMIN &&
      (
        targetUser.role === UserRole.ADMIN ||
        targetUser.role === UserRole.SUPER_ADMIN
      )
    ) {
      throw new ForbiddenException(
        'Un administrateur ne peut pas modifier le statut d’un ADMIN ou SUPER_ADMIN',
      );
    }

    if (
      actor.role !== UserRole.ADMIN &&
      actor.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Vous n’êtes pas autorisé à modifier le statut de ce compte',
      );
    }

    if (
      targetUser.status === updateUserStatusDto.status
    ) {
      throw new BadRequestException(
        'Ce compte possède déjà ce statut',
      );
    }

    const now = new Date();

    const updatedUser = await tx.user.update({
      where: {
        id: userId,
      },
      data: {
        status: updateUserStatusDto.status,
      },
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
    });

    let revokedSessions = 0;

    if (
      updateUserStatusDto.status ===
      UserStatus.DISABLED
    ) {
      const result =
        await tx.refreshSession.updateMany({
          where: {
            userId,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
            lastUsedAt: now,
          },
        });

      revokedSessions = result.count;
    }

    await tx.securityAuditLog.create({
      data: {
        action:
          SecurityAction.USER_STATUS_CHANGED,
        actorId: actor.userId,
        targetUserId: userId,
        reason: updateUserStatusDto.reason,
        previousStatus: targetUser.status,
        newStatus: updateUserStatusDto.status,
      },
    });

    return {
      message: 'Statut utilisateur mis à jour',
      revokedSessions,
      user: updatedUser,
    };
  });
}

}