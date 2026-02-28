-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "WorkspaceType" AS ENUM ('PERSONAL', 'TEAM');

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "type" "WorkspaceType" NOT NULL,
    "userId" TEXT,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teams_slug_key" ON "teams"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_teamId_userId_key" ON "team_members"("teamId", "userId");

-- CreateIndex
CREATE INDEX "team_members_userId_idx" ON "team_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_userId_key" ON "workspaces"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_teamId_key" ON "workspaces"("teamId");

-- CreateIndex
CREATE INDEX "workspaces_type_idx" ON "workspaces"("type");

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add workspace columns to connections
ALTER TABLE "connections" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "connections" ADD COLUMN "createdById" TEXT;

-- Create one personal workspace per user
INSERT INTO "workspaces" ("id", "type", "userId", "createdAt", "updatedAt")
SELECT
  'ws_personal_' || "id",
  'PERSONAL'::"WorkspaceType",
  "id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users"
ON CONFLICT ("userId") DO NOTHING;

-- Move existing connection ownership from userId to workspaceId
UPDATE "connections" c
SET
  "workspaceId" = 'ws_personal_' || c."userId",
  "createdById" = c."userId"
WHERE c."workspaceId" IS NULL;

-- Enforce new ownership fields
ALTER TABLE "connections" ALTER COLUMN "workspaceId" SET NOT NULL;

-- Remove old ownership relation
ALTER TABLE "connections" DROP CONSTRAINT IF EXISTS "connections_userId_fkey";
ALTER TABLE "connections" DROP COLUMN "userId";

-- CreateIndex
CREATE INDEX "connections_workspaceId_idx" ON "connections"("workspaceId");

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep workspace integrity consistent at DB level
ALTER TABLE "workspaces"
  ADD CONSTRAINT "workspaces_type_owner_check"
  CHECK (
    ("type" = 'PERSONAL' AND "userId" IS NOT NULL AND "teamId" IS NULL) OR
    ("type" = 'TEAM' AND "teamId" IS NOT NULL AND "userId" IS NULL)
  );
