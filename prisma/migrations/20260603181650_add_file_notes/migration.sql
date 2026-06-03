-- CreateTable
CREATE TABLE "file_notes" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorDisplayName" TEXT NOT NULL,
    "authorImageUrl" TEXT,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_notes_connectionId_bucket_key_createdAt_idx" ON "file_notes"("connectionId", "bucket", "key", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "file_notes_connectionId_bucket_createdAt_idx" ON "file_notes"("connectionId", "bucket", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "file_notes_authorId_idx" ON "file_notes"("authorId");

-- AddForeignKey
ALTER TABLE "file_notes" ADD CONSTRAINT "file_notes_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_notes" ADD CONSTRAINT "file_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
