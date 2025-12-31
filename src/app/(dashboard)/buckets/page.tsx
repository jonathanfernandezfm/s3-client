import { BucketList } from "@/components/buckets/bucket-list";

export default function BucketsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold mb-6">Buckets</h1>
      <BucketList />
    </div>
  );
}
