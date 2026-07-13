import {
  IsString,
  Length,
  Matches,
} from 'class-validator';
import {
  PASSWORD_COMPLEXITY_MESSAGE,
  PASSWORD_COMPLEXITY_REGEX,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../security/password.security';
import {
  PASSWORD_RESET_TOKEN_MAX_LENGTH,
  PASSWORD_RESET_TOKEN_MESSAGE,
  PASSWORD_RESET_TOKEN_MIN_LENGTH,
  PASSWORD_RESET_TOKEN_REGEX,
} from '../../security/password-reset-token.security';

export class PasswordResetConfirmDto {
  @IsString()
    @Length(
    PASSWORD_RESET_TOKEN_MIN_LENGTH,
    PASSWORD_RESET_TOKEN_MAX_LENGTH,
    )
    @Matches(PASSWORD_RESET_TOKEN_REGEX, {
    message: PASSWORD_RESET_TOKEN_MESSAGE,
    })
    token!: string;

  @IsString()
  @Length(
    PASSWORD_MIN_LENGTH,
    PASSWORD_MAX_LENGTH,
  )
  @Matches(PASSWORD_COMPLEXITY_REGEX, {
    message: PASSWORD_COMPLEXITY_MESSAGE,
  })
  newPassword!: string;
}