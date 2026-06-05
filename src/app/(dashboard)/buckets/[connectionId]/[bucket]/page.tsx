import { Suspense } from "react";
import { BucketDetailTabs } from "@/components/buckets/bucket-detail-tabs";

interface PageProps {
  params: Promise<{ connectionId: string; bucket: string }>;
}

export default async function BucketDetailPage({ params }: PageProps) {
  const { connectionId, bucket } = await params;
  const decodedBucket = decodeURIComponent(bucket);

  return (
    <Suspense fallback={null}>
      <BucketDetailTabs connectionId={connectionId} bucket={decodedBucket} />
    </Suspense>
  );
}
