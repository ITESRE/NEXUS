import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly safeUserSelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    role: true,
    status: true,
    createdAt: true,
    updatedAt: true,
  };

  async findAll() {
    return this.prisma.user.findMany({
      select: this.safeUserSelect,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.safeUserSelect,
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    return user;
  }

    async create(createUserDto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà');
    }

    const passwordHash = await argon2.hash(createUserDto.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    return this.prisma.user.create({
      data: {
        email: createUserDto.email,
        passwordHash,
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
      },
      select: this.safeUserSelect,
    });
  }

  async findByEmailForAuth(email: string) {
  return this.prisma.user.findUnique({
    where: { email },
  });
  }

  async findByIdForAuth(id: string) {
  return this.prisma.user.findUnique({
    where: { id },
    select: this.safeUserSelect,
  });
  }

}