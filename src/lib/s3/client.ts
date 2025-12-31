import { S3Client } from "@aws-sdk/client-s3";
import type { S3Connection } from "@/types";

export function createS3Client(connection: S3Connection): S3Client {
  return new S3Client({
    endpoint: connection.endpoint,
    region: connection.region || "us-east-1",
    credentials: {
      accessKeyId: connection.accessKeyId,
      secretAccessKey: connection.secretAccessKey,
    },
    forcePathStyle: connection.forcePathStyle ?? true,
  });
}
