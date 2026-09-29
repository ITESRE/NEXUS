import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { PlatformRole } from '@prisma/client';

export class UpdateUserPlatformRoleDto {
  @IsEnum(PlatformRole)
  platformRole!: PlatformRole;

  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim()
      : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}