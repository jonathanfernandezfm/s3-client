import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-4 p-6">
      <div className="rounded-full bg-muted p-4">
        <FileQuestion className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold">Page not found</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted/60"
      >
        Go home
      </Link>
    </div>
  );
}
