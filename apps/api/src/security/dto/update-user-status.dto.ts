import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { UserStatus } from '@prisma/client';

export class UpdateUserStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;

  @ValidateIf(
    (dto: UpdateUserStatusDto) =>
      dto.status === UserStatus.DISABLED ||
      dto.reason !== undefined,
  )
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;
}