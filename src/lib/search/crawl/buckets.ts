import { ListBucketsCommand, type S3Client } from "@aws-sdk/client-s3";

export async function listBuckets(client: S3Client): Promise<string[]> {
  const res = await client.send(new ListBucketsCommand({}));
  return (res.Buckets ?? []).map((b) => b.Name).filter((n): n is string => !!n);
}
