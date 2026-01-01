import { FileBrowser } from "@/components/browser/file-browser";

interface BrowserPageProps {
  params: Promise<{
    connectionId: string;
    bucket: string;
    path?: string[];
  }>;
}

export default async function BrowserPage({ params }: BrowserPageProps) {
  const { connectionId, bucket, path } = await params;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold mb-6">File Browser</h1>
      <FileBrowser connectionId={connectionId} bucket={bucket} path={path} />
    </div>
  );
}
