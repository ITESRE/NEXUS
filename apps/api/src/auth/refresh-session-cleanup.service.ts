import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const REFRESH_SESSION_RETENTION_DAYS = 30;

const MILLISECONDS_PER_DAY =
  24 * 60 * 60 * 1000;

@Injectable()
export class RefreshSessionCleanupService {
  private readonly logger = new Logger(
    RefreshSessionCleanupService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  @Cron('0 3 * * *')
  async handleCleanup(): Promise<void> {
    try {
      const deletedSessions =
        await this.cleanupOldSessions();

      if (deletedSessions > 0) {
        this.logger.log(
          `${deletedSessions} ancienne(s) session(s) supprimée(s)`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Échec du nettoyage des refresh sessions',
        error instanceof Error
          ? error.stack
          : undefined,
      );
    }
  }

  async cleanupOldSessions(
    now: Date = new Date(),
  ): Promise<number> {
    const retentionLimit = new Date(
      now.getTime() -
        REFRESH_SESSION_RETENTION_DAYS *
          MILLISECONDS_PER_DAY,
    );

    const result =
      await this.prisma.refreshSession.deleteMany({
        where: {
          OR: [
            {
              expiresAt: {
                lte: retentionLimit,
              },
            },
            {
              revokedAt: {
                lte: retentionLimit,
              },
            },
          ],
        },
      });

    return result.count;
  }
}