-- CreateTable
CREATE TABLE "connections" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "endpoint" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'us-east-1',
    "accessKeyId" TEXT NOT NULL,
    "secretAccessKey" TEXT NOT NULL,
    "forcePathStyle" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);
