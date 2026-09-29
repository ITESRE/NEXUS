BEGIN;

CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey"
        PRIMARY KEY ("id")
);

CREATE TABLE "UserApplicationAccess" (
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserApplicationAccess_pkey"
        PRIMARY KEY ("userId", "applicationId")
);

CREATE UNIQUE INDEX "Application_key_key"
ON "Application"("key");

CREATE INDEX "Application_enabled_sortOrder_idx"
ON "Application"("enabled", "sortOrder");

CREATE INDEX "UserApplicationAccess_applicationId_idx"
ON "UserApplicationAccess"("applicationId");

ALTER TABLE "UserApplicationAccess"
ADD CONSTRAINT "UserApplicationAccess_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "UserApplicationAccess"
ADD CONSTRAINT "UserApplicationAccess_applicationId_fkey"
FOREIGN KEY ("applicationId")
REFERENCES "Application"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Catalogue initial.
-- L'identifiant est volontairement stable pour cette application systeme.
INSERT INTO "Application" (
    "id",
    "key",
    "name",
    "description",
    "enabled",
    "sortOrder",
    "createdAt",
    "updatedAt"
)
VALUES (
    '00000000-0000-4000-8000-000000000001',
    'NEXUS_SOCIAL',
    'NEXUS Social',
    NULL,
    true,
    10,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

-- Compatibilite :
-- tout utilisateur disposant deja d'un SocialProfile
-- conserve automatiquement son acces NEXUS Social.
INSERT INTO "UserApplicationAccess" (
    "userId",
    "applicationId",
    "createdAt"
)
SELECT
    sp."userId",
    app."id",
    CURRENT_TIMESTAMP
FROM "SocialProfile" sp
JOIN "Application" app
    ON app."key" = 'NEXUS_SOCIAL'
ON CONFLICT ("userId", "applicationId")
DO NOTHING;

COMMIT;