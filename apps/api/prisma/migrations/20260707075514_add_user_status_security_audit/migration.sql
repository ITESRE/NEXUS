-- AlterEnum
ALTER TYPE "SecurityAction" ADD VALUE 'USER_STATUS_CHANGED';

-- AlterTable
ALTER TABLE "SecurityAuditLog" ADD COLUMN     "newStatus" "UserStatus",
ADD COLUMN     "previousStatus" "UserStatus";
