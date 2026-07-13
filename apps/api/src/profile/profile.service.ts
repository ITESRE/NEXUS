import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  hashPassword,
  verifyPassword,
} from '../security/password.security';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Prisma, SecurityAction, UserStatus, } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { EmailChangeRequestDto } from './dto/email-change-request.dto';
import {
  generateEmailChangeToken,
  getEmailChangeTokenExpirationDate,
  hashEmailChangeToken,
} from '../security/email-change-token.security';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(
    ProfileService.name,
  );
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

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

  async requestEmailChange(
    userId: string,
    emailChangeRequestDto:
      EmailChangeRequestDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundException(
        'Utilisateur introuvable',
      );
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        'Compte non autorisé',
      );
    }

    const isCurrentPasswordValid =
      await verifyPassword(
        user.passwordHash,
        emailChangeRequestDto.currentPassword,
      );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException(
        'Mot de passe actuel incorrect',
      );
    }

    if (
      user.email ===
      emailChangeRequestDto.newEmail
    ) {
      throw new BadRequestException(
        'La nouvelle adresse email doit être différente de l’adresse actuelle',
      );
    }

    const existingUser =
      await this.prisma.user.findUnique({
        where: {
          email:
            emailChangeRequestDto.newEmail,
        },
        select: {
          id: true,
        },
      });

    if (existingUser) {
      throw new ConflictException(
        'Cette adresse email est indisponible',
      );
    }

    const emailChangeToken =
      generateEmailChangeToken();

    const tokenHash =
      hashEmailChangeToken(
        emailChangeToken,
      );

    const now = new Date();

    const createdToken =
      await this.prisma.$transaction(
        async (tx) => {
          await tx.emailChangeToken.updateMany({
            where: {
              userId,
              usedAt: null,
              expiresAt: {
                gt: now,
              },
            },
            data: {
              usedAt: now,
            },
          });

          return tx.emailChangeToken.create({
            data: {
              tokenHash,
              userId,
              newEmail:
                emailChangeRequestDto.newEmail,
              expiresAt:
                getEmailChangeTokenExpirationDate(
                  now,
                ),
            },
            select: {
              id: true,
            },
          });
        },
      );

    try {
      await this.mailService
        .sendEmailChangeVerificationEmail(
          emailChangeRequestDto.newEmail,
          emailChangeToken,
        );
    } catch (error) {
      await this.prisma.emailChangeToken.updateMany({
        where: {
          id: createdToken.id,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });

      this.logger.error(
        "Échec de l'envoi de l'email de vérification",
        error instanceof Error
          ? error.stack
          : undefined,
      );

      throw new ServiceUnavailableException(
        "Impossible d'envoyer l'email de vérification pour le moment",
      );
    }

    return {
      message:
        'Un email de vérification a été envoyé à la nouvelle adresse',
    };
  }

  async confirmEmailChange(
    emailChangeToken: string,
  ) {
    const invalidTokenMessage =
      'Token de changement d’adresse email invalide ou expiré';

    const tokenHash =
      hashEmailChangeToken(
        emailChangeToken,
      );

    const now = new Date();

    const storedToken =
      await this.prisma.emailChangeToken.findUnique({
        where: {
          tokenHash,
        },
        select: {
          id: true,
          userId: true,
          newEmail: true,
          expiresAt: true,
          usedAt: true,
          user: {
            select: {
              email: true,
              status: true,
            },
          },
        },
      });

    if (
      !storedToken ||
      storedToken.usedAt ||
      storedToken.expiresAt <= now ||
      storedToken.user.status !==
        UserStatus.ACTIVE ||
      storedToken.user.email ===
        storedToken.newEmail
    ) {
      throw new BadRequestException(
        invalidTokenMessage,
      );
    }

    const existingUser =
      await this.prisma.user.findUnique({
        where: {
          email: storedToken.newEmail,
        },
        select: {
          id: true,
        },
      });

    if (
      existingUser &&
      existingUser.id !== storedToken.userId
    ) {
      throw new ConflictException(
        'Cette adresse email est indisponible',
      );
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const claimedToken =
            await tx.emailChangeToken.updateMany({
              where: {
                id: storedToken.id,
                userId: storedToken.userId,
                usedAt: null,
                expiresAt: {
                  gt: now,
                },
              },
              data: {
                usedAt: now,
              },
            });

          if (claimedToken.count !== 1) {
            throw new BadRequestException(
              invalidTokenMessage,
            );
          }

          const updatedUser =
            await tx.user.updateMany({
              where: {
                id: storedToken.userId,
                status: UserStatus.ACTIVE,
                email: storedToken.user.email,
              },
              data: {
                email: storedToken.newEmail,
                authVersion: {
                  increment: 1,
                },
              },
            });

          if (updatedUser.count !== 1) {
            throw new BadRequestException(
              invalidTokenMessage,
            );
          }

          const revokedSessions =
            await tx.refreshSession.updateMany({
              where: {
                userId: storedToken.userId,
                revokedAt: null,
              },
              data: {
                revokedAt: now,
                lastUsedAt: now,
              },
            });

          await tx.emailChangeToken.updateMany({
            where: {
              userId: storedToken.userId,
              usedAt: null,
            },
            data: {
              usedAt: now,
            },
          });

          await tx.securityAuditLog.create({
            data: {
              action:
                SecurityAction.USER_EMAIL_CHANGED,
              actorId: storedToken.userId,
              targetUserId:
                storedToken.userId,
              previousEmail:
                storedToken.user.email,
              newEmail:
                storedToken.newEmail,
            },
          });

          return {
            message:
              'Adresse email modifiée avec succès',
            revokedSessions:
              revokedSessions.count,
          };
        },
      );
    } catch (error) {
      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Cette adresse email est indisponible',
        );
      }

      throw error;
    }
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