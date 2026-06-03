-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('UPLOAD', 'DELETE', 'COPY', 'MOVE', 'RENAME', 'FOLDER_CREATE', 'TAG_CHANGE', 'BUCKET_CREATE', 'BUCKET_DELETE');

-- CreateTable
CREATE TABLE "activity_events" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "userId" TEXT,
    "userDisplayName" TEXT NOT NULL,
    "userImageUrl" TEXT,
    "action" "ActivityAction" NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT,
    "targetKey" TEXT,
    "byteSize" BIGINT,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_events_connectionId_bucket_createdAt_idx" ON "activity_events"("connectionId", "bucket", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "activity_events_connectionId_bucket_key_createdAt_idx" ON "activity_events"("connectionId", "bucket", "key", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "activity_events_batchId_idx" ON "activity_events"("batchId");

-- CreateIndex
CREATE INDEX "activity_events_userId_idx" ON "activity_events"("userId");

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
