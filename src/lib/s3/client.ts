import { S3Client } from "@aws-sdk/client-s3";

export interface S3ClientConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  forcePathStyle?: boolean;
}

export function createS3Client(connection: S3ClientConfig): S3Client {
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
