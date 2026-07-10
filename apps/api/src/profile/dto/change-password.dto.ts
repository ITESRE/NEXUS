import {
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @Length(12, 128)
  currentPassword!: string;

  @IsString()
  @Length(12, 128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/,
    {
      message:
        'Le nouveau mot de passe doit contenir au moins une minuscule, une majuscule, un chiffre et un caractère spécial',
    },
  )
  newPassword!: string;
}