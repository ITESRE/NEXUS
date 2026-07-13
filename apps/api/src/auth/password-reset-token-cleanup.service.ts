import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const PASSWORD_RESET_TOKEN_RETENTION_DAYS = 7;

const MILLISECONDS_PER_DAY =
  24 * 60 * 60 * 1000;

@Injectable()
export class PasswordResetTokenCleanupService {
  private readonly logger = new Logger(
    PasswordResetTokenCleanupService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  @Cron('15 3 * * *')
  async handleCleanup(): Promise<void> {
    try {
      const deletedTokens =
        await this.cleanupOldTokens();

      if (deletedTokens > 0) {
        this.logger.log(
          `${deletedTokens} ancien(s) token(s) de réinitialisation supprimé(s)`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Échec du nettoyage des tokens de réinitialisation',
        error instanceof Error
          ? error.stack
          : undefined,
      );
    }
  }

  async cleanupOldTokens(
    now: Date = new Date(),
  ): Promise<number> {
    const retentionLimit = new Date(
      now.getTime() -
        PASSWORD_RESET_TOKEN_RETENTION_DAYS *
          MILLISECONDS_PER_DAY,
    );

    const result =
      await this.prisma.passwordResetToken.deleteMany({
        where: {
          OR: [
            {
              expiresAt: {
                lte: retentionLimit,
              },
            },
            {
              usedAt: {
                lte: retentionLimit,
              },
            },
          ],
        },
      });

    return result.count;
  }
}