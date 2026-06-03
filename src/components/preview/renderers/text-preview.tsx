"use client";

import { useState, useEffect } from "react";
import { Loader2, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchTextWithCap } from "@/lib/preview/text-fetch";
import { inferLanguage } from "@/lib/preview/language-map";
import { formatBytes } from "@/lib/utils";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface RendererProps {
  presignedUrl: string;
  filename: string;
}

type State =
  | { status: "loading" }
  | { status: "ready"; text: string; language: string | null }
  | { status: "tooLarge"; sizeBytes: number }
  | { status: "error"; message: string };

export default function TextPreview({ presignedUrl, filename }: RendererProps) {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = async () => {
    setState({ status: "loading" });
    const result = await fetchTextWithCap(presignedUrl);
    if (result.ok) {
      setState({ status: "ready", text: result.text, language: inferLanguage(filename) });
    } else if (result.reason === "tooLarge") {
      setState({ status: "tooLarge", sizeBytes: result.sizeBytes });
    } else {
      setState({ status: "error", message: result.message });
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presignedUrl]);

  if (state.status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Loading file…</p>
      </div>
    );
  }

  if (state.status === "tooLarge") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <p className="text-sm">
          File too large to preview ({formatBytes(state.sizeBytes)}). Max 5 MB.
        </p>
        <Button variant="outline" size="sm" asChild>
          <a href={presignedUrl} download={filename} target="_blank" rel="noreferrer">
            <Download className="h-4 w-4 mr-2" />
            Download
          </a>
        </Button>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <p className="text-sm">{state.message}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={presignedUrl} download={filename} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4 mr-2" />
              Download
            </a>
          </Button>
        </div>
      </div>
    );
  }

  const { text, language } = state;

  if (!language) {
    return (
      <pre className="text-sm font-mono p-4 overflow-auto max-h-[70vh] whitespace-pre-wrap break-words">
        {text}
      </pre>
    );
  }

  return (
    <div className="overflow-auto max-h-[70vh] text-sm rounded">
      <SyntaxHighlighter language={language} style={oneDark} wrapLongLines>
        {text}
      </SyntaxHighlighter>
    </div>
  );
}
