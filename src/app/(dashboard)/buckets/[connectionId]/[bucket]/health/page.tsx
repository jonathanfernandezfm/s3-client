import { redirect } from "next/navigation";

export default async function BucketHealthPage({
  params,
}: {
  params: Promise<{ connectionId: string; bucket: string }>;
}) {
  const { connectionId, bucket } = await params;
  redirect(`/buckets/${connectionId}/${encodeURIComponent(bucket)}?tab=permissions`);
}
