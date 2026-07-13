import {
  createHash,
  randomBytes,
} from 'node:crypto';

export const PASSWORD_RESET_TOKEN_TTL_MINUTES =
  30;

export const PASSWORD_RESET_TOKEN_MIN_LENGTH =
  64;

export const PASSWORD_RESET_TOKEN_MAX_LENGTH =
  256;

export const PASSWORD_RESET_TOKEN_REGEX =
  /^[A-Za-z0-9_-]+$/;

export const PASSWORD_RESET_TOKEN_MESSAGE =
  'Le token de réinitialisation est invalide';

const PASSWORD_RESET_TOKEN_BYTES = 48;

const MILLISECONDS_PER_MINUTE =
  60 * 1000;

export function generatePasswordResetToken():
  string {
  return randomBytes(
    PASSWORD_RESET_TOKEN_BYTES,
  ).toString('base64url');
}

export function hashPasswordResetToken(
  resetToken: string,
): string {
  return createHash('sha256')
    .update(resetToken)
    .digest('hex');
}

export function getPasswordResetTokenExpirationDate(
  now: Date = new Date(),
): Date {
  return new Date(
    now.getTime() +
      PASSWORD_RESET_TOKEN_TTL_MINUTES *
        MILLISECONDS_PER_MINUTE,
  );
}