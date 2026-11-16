-- Refresh-token rotation lineage + revocation.
-- familyId is backfilled from the row id so every pre-existing token becomes the
-- root of its own family; NOT NULL is applied only after the backfill so this
-- migration is safe against a populated table.
ALTER TABLE "RefreshToken" ADD COLUMN "familyId" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "revokedAt" TIMESTAMP(3);

UPDATE "RefreshToken" SET "familyId" = "id" WHERE "familyId" IS NULL;

ALTER TABLE "RefreshToken" ALTER COLUMN "familyId" SET NOT NULL;

CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
