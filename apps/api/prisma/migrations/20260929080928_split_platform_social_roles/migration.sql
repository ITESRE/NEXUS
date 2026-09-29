BEGIN;

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "SocialRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';

-- Backfill des droits plateforme depuis le role historique.
--
-- USER        -> USER
-- MODERATOR   -> USER
-- ADMIN       -> ADMIN
-- SUPER_ADMIN -> SUPER_ADMIN
UPDATE "User"
SET "platformRole" =
  CASE
    WHEN "role" = 'ADMIN'::"UserRole"
      THEN 'ADMIN'::"PlatformRole"
    WHEN "role" = 'SUPER_ADMIN'::"UserRole"
      THEN 'SUPER_ADMIN'::"PlatformRole"
    ELSE 'USER'::"PlatformRole"
  END;

-- CreateTable
CREATE TABLE "SocialProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "SocialRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialProfile_pkey" PRIMARY KEY ("id")
);

-- Backfill des profils NEXUS Social existants.
--
-- USER        -> USER
-- MODERATOR   -> MODERATOR
-- ADMIN       -> ADMIN
-- SUPER_ADMIN -> ADMIN
--
-- gen_random_uuid() est fourni nativement par PostgreSQL 16.
INSERT INTO "SocialProfile" (
    "id",
    "userId",
    "role",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    "id",
    CASE
      WHEN "role" = 'MODERATOR'::"UserRole"
        THEN 'MODERATOR'::"SocialRole"
      WHEN "role" = 'ADMIN'::"UserRole"
        THEN 'ADMIN'::"SocialRole"
      WHEN "role" = 'SUPER_ADMIN'::"UserRole"
        THEN 'ADMIN'::"SocialRole"
      ELSE 'USER'::"SocialRole"
    END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User";

-- CreateIndex
CREATE UNIQUE INDEX "SocialProfile_userId_key"
ON "SocialProfile"("userId");

-- CreateIndex
CREATE INDEX "SocialProfile_role_idx"
ON "SocialProfile"("role");

-- AddForeignKey
ALTER TABLE "SocialProfile"
ADD CONSTRAINT "SocialProfile_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

COMMIT;