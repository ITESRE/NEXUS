import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  MaxLength,
} from 'class-validator';

export class PasswordResetRequestDto {
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().toLowerCase()
      : value,
  )
  @IsString()
  @IsEmail()
  @MaxLength(254)
  email!: string;
}