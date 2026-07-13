import {
  createHash,
  randomBytes,
} from 'node:crypto';

export const EMAIL_CHANGE_TOKEN_TTL_MINUTES =
  30;

export const EMAIL_CHANGE_TOKEN_MIN_LENGTH =
  64;

export const EMAIL_CHANGE_TOKEN_MAX_LENGTH =
  256;

export const EMAIL_CHANGE_TOKEN_REGEX =
  /^[A-Za-z0-9_-]+$/;

export const EMAIL_CHANGE_TOKEN_MESSAGE =
  'Le token de changement d’adresse email est invalide';

const EMAIL_CHANGE_TOKEN_BYTES = 48;

const MILLISECONDS_PER_MINUTE =
  60 * 1000;

export function generateEmailChangeToken():
  string {
  return randomBytes(
    EMAIL_CHANGE_TOKEN_BYTES,
  ).toString('base64url');
}

export function hashEmailChangeToken(
  emailChangeToken: string,
): string {
  return createHash('sha256')
    .update(emailChangeToken)
    .digest('hex');
}

export function getEmailChangeTokenExpirationDate(
  now: Date = new Date(),
): Date {
  return new Date(
    now.getTime() +
      EMAIL_CHANGE_TOKEN_TTL_MINUTES *
        MILLISECONDS_PER_MINUTE,
  );
}