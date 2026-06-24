/*
  Warnings:

  - You are about to drop the column `search_text` on the `object_index` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ShareLinkEventAction" AS ENUM ('VIEW', 'UNLOCK_ATTEMPT', 'UNLOCK_SUCCESS', 'DOWNLOAD');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityAction" ADD VALUE 'METADATA_CHANGE';
ALTER TYPE "ActivityAction" ADD VALUE 'SHARE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'SHARE_REVOKED';
ALTER TYPE "ActivityAction" ADD VALUE 'MULTIPART_ABORT';
ALTER TYPE "ActivityAction" ADD VALUE 'VERSION_RESTORE';
ALTER TYPE "ActivityAction" ADD VALUE 'VERSION_UNDELETE';
ALTER TYPE "ActivityAction" ADD VALUE 'VERSION_PURGE';
ALTER TYPE "ActivityAction" ADD VALUE 'BUCKET_VERSIONING_ENABLE';
ALTER TYPE "ActivityAction" ADD VALUE 'BUCKET_VERSIONING_SUSPEND';

-- DropIndex
DROP INDEX "idx_object_index_search";

-- AlterTable
ALTER TABLE "bookmarks" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "object_index" DROP COLUMN "search_text";

-- CreateTable
CREATE TABLE "share_links" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByDisplayName" TEXT NOT NULL,
    "createdByImageUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "passwordHash" TEXT,
    "maxUses" INTEGER,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_link_events" (
    "id" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "action" "ShareLinkEventAction" NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "referrer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_link_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "share_links_slug_key" ON "share_links"("slug");

-- CreateIndex
CREATE INDEX "share_links_connectionId_createdAt_idx" ON "share_links"("connectionId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "share_links_connectionId_bucket_key_createdAt_idx" ON "share_links"("connectionId", "bucket", "key", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "share_link_events_shareLinkId_createdAt_idx" ON "share_link_events"("shareLinkId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_link_events" ADD CONSTRAINT "share_link_events_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "share_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
