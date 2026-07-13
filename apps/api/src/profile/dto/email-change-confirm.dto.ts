import {
  IsString,
  Length,
  Matches,
} from 'class-validator';
import {
  EMAIL_CHANGE_TOKEN_MAX_LENGTH,
  EMAIL_CHANGE_TOKEN_MESSAGE,
  EMAIL_CHANGE_TOKEN_MIN_LENGTH,
  EMAIL_CHANGE_TOKEN_REGEX,
} from '../../security/email-change-token.security';

export class EmailChangeConfirmDto {
  @IsString()
  @Length(
    EMAIL_CHANGE_TOKEN_MIN_LENGTH,
    EMAIL_CHANGE_TOKEN_MAX_LENGTH,
  )
  @Matches(EMAIL_CHANGE_TOKEN_REGEX, {
    message: EMAIL_CHANGE_TOKEN_MESSAGE,
  })
  token!: string;
}