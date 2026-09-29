BEGIN;

ALTER TYPE "SecurityAction"
ADD VALUE 'USER_APPLICATION_ACCESS_GRANTED';

ALTER TYPE "SecurityAction"
ADD VALUE 'USER_APPLICATION_ACCESS_REVOKED';

ALTER TABLE "SecurityAuditLog"
ADD COLUMN "applicationKey" TEXT;

CREATE INDEX "SecurityAuditLog_applicationKey_idx"
ON "SecurityAuditLog"("applicationKey");

COMMIT;