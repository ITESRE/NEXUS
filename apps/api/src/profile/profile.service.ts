import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  hashPassword,
  verifyPassword,
} from '../security/password.security';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SecurityAction } from '@prisma/client';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({
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
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    return user;
  }

  async updateMe(userId: string, updateProfileDto: UpdateProfileDto) {
    if (
      updateProfileDto.firstName === undefined &&
      updateProfileDto.lastName === undefined
    ) {
      throw new BadRequestException(
        'Au moins un champ doit être fourni',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    return this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        firstName: updateProfileDto.firstName,
        lastName: updateProfileDto.lastName,
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
  }

  async changePassword(
  userId: string,
  changePasswordDto: ChangePasswordDto,
) {
  const user = await this.prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      passwordHash: true,
    },
  });

  if (!user) {
    throw new NotFoundException(
      'Utilisateur introuvable',
    );
  }

  const isCurrentPasswordValid =
    await verifyPassword(
      user.passwordHash,
      changePasswordDto.currentPassword,
    );

  if (!isCurrentPasswordValid) {
    throw new UnauthorizedException(
      'Mot de passe actuel incorrect',
    );
  }

  const isSamePassword =
    await verifyPassword(
      user.passwordHash,
      changePasswordDto.newPassword,
    );

  if (isSamePassword) {
    throw new BadRequestException(
      'Le nouveau mot de passe doit être différent de l ancien',
    );
  }

  const newPasswordHash =
    await hashPassword(
      changePasswordDto.newPassword,
    );

  const now = new Date();

  return this.prisma.$transaction(
    async (tx) => {
      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          passwordHash: newPasswordHash,
          authVersion: {
            increment: 1,
          },
        },
      });

      const revokedSessions =
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

        await tx.securityAuditLog.create({
        data: {
          action:
            SecurityAction.USER_PASSWORD_CHANGED,
          actorId: userId,
          targetUserId: userId,
        },
      });

      return {
        message:
          'Mot de passe modifié avec succès',
        revokedSessions:
          revokedSessions.count,
      };
    },
  );
}


}