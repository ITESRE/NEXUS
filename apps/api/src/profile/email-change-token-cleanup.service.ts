import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const EMAIL_CHANGE_TOKEN_RETENTION_DAYS = 7;

const MILLISECONDS_PER_DAY =
  24 * 60 * 60 * 1000;

@Injectable()
export class EmailChangeTokenCleanupService {
  private readonly logger = new Logger(
    EmailChangeTokenCleanupService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  @Cron('30 3 * * *')
  async handleCleanup(): Promise<void> {
    try {
      const deletedTokens =
        await this.cleanupOldTokens();

      if (deletedTokens > 0) {
        this.logger.log(
          `${deletedTokens} ancien(s) token(s) de changement d'adresse supprime(s)`,
        );
      }
    } catch (error) {
      this.logger.error(
        "Echec du nettoyage des tokens de changement d'adresse",
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
        EMAIL_CHANGE_TOKEN_RETENTION_DAYS *
          MILLISECONDS_PER_DAY,
    );

    const result =
      await this.prisma.emailChangeToken.deleteMany({
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