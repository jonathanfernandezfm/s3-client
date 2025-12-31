import { FileBrowser } from "@/components/browser/file-browser";

interface BrowserPageProps {
  params: Promise<{
    bucket: string;
    path?: string[];
  }>;
}

export default async function BrowserPage({ params }: BrowserPageProps) {
  const { bucket, path } = await params;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold mb-6">File Browser</h1>
      <FileBrowser bucket={bucket} path={path} />
    </div>
  );
}
