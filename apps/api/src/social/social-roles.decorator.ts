import { SetMetadata } from '@nestjs/common';
import { SocialRole } from '@prisma/client';

export const SOCIAL_ROLES_KEY =
  'socialRoles';

export const SocialRoles = (
  ...roles: SocialRole[]
) =>
  SetMetadata(
    SOCIAL_ROLES_KEY,
    roles,
  );