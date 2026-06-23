"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-4 p-6">
      <div className="rounded-full bg-muted p-4">
        <AlertTriangle className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          An unexpected error occurred. You can try again, and if it keeps
          happening, please reload the page.
        </p>
      </div>
      <Button onClick={() => reset()}>
        <RotateCcw className="h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}
