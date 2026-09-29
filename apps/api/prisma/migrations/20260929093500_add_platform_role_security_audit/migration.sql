BEGIN;

ALTER TYPE "SecurityAction"
ADD VALUE 'USER_PLATFORM_ROLE_CHANGED';

ALTER TABLE "SecurityAuditLog"
ADD COLUMN "previousPlatformRole" "PlatformRole",
ADD COLUMN "newPlatformRole" "PlatformRole";

COMMIT;