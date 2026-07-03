import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async getHealth() {
    const userCount = await this.prisma.user.count();

    return {
      status: 'ok',
      app: 'NEXUS API',
      database: 'connected',
      users: userCount,
      timestamp: new Date().toISOString(),
    };
  }
}