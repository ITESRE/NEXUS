-- AlterEnum
ALTER TYPE "SecurityAction" ADD VALUE 'USER_ROLE_CHANGED';

-- AlterTable
ALTER TABLE "SecurityAuditLog" ADD COLUMN     "newRole" "UserRole",
ADD COLUMN     "previousRole" "UserRole";
