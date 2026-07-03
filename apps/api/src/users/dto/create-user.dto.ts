import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @IsString()
  @Length(12, 128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message:
      'Le mot de passe doit contenir au moins une minuscule, une majuscule, un chiffre et un caractère spécial.',
  })
  password!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  lastName!: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}