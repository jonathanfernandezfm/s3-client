CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- CreateEnum
CREATE TYPE "CrawlJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL_LIMIT_HIT');

-- CreateEnum
CREATE TYPE "CrawlJobKind" AS ENUM ('INITIAL', 'RECONCILE');

-- CreateTable
CREATE TABLE "object_index" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "lastModified" TIMESTAMP(3) NOT NULL,
    "etag" TEXT,
    "extension" TEXT,
    "mime" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "object_index_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_jobs" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "kind" "CrawlJobKind" NOT NULL,
    "status" "CrawlJobStatus" NOT NULL DEFAULT 'PENDING',
    "currentBucket" TEXT,
    "bucketsRemaining" TEXT[],
    "nextContinuationToken" TEXT,
    "objectsIndexed" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "lastTickAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "object_index_workspaceId_lastModified_idx" ON "object_index"("workspaceId", "lastModified" DESC);

-- CreateIndex
CREATE INDEX "object_index_connectionId_lastSeenAt_idx" ON "object_index"("connectionId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "object_index_connectionId_bucket_key_key" ON "object_index"("connectionId", "bucket", "key");

-- CreateIndex
CREATE INDEX "crawl_jobs_connectionId_kind_status_idx" ON "crawl_jobs"("connectionId", "kind", "status");

-- CreateIndex
CREATE INDEX "crawl_jobs_status_lastTickAt_idx" ON "crawl_jobs"("status", "lastTickAt");

-- AddForeignKey
ALTER TABLE "object_index" ADD CONSTRAINT "object_index_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_jobs" ADD CONSTRAINT "crawl_jobs_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Generated search column (kept out of the Prisma model; written by the DB).
ALTER TABLE "object_index"
  ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (
    lower("bucket" || ' ' || replace("key", '/', ' '))
  ) STORED;

-- Trigram GIN index for fuzzy search on the generated column.
CREATE INDEX "idx_object_index_search"
  ON "object_index" USING gin ("search_text" gin_trgm_ops);

-- Btree index to narrow by workspace before fuzzy-matching.
CREATE INDEX "idx_object_index_workspace"
  ON "object_index" ("workspaceId");
