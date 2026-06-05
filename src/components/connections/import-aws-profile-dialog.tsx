"use client";

import { useReducer, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseAwsProfiles, type ParsedProfile } from "@/lib/aws/parse-profiles";

interface ImportAwsProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultWorkspaceId?: string;
}

interface UploadState {
  step: "upload";
  credentials?: string;
  config?: string;
  parseError?: string;
}

type State = UploadState;

type Action =
  | { type: "set-credentials"; content: string }
  | { type: "set-config"; content: string }
  | { type: "set-parse-error"; error: string }
  | { type: "reset" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set-credentials":
      return { ...state, credentials: action.content, parseError: undefined };
    case "set-config":
      return { ...state, config: action.content, parseError: undefined };
    case "set-parse-error":
      return { ...state, parseError: action.error };
    case "reset":
      return { step: "upload" };
  }
}

const MAX_FILE_SIZE = 1024 * 1024;

export function ImportAwsProfileDialog({
  open,
  onOpenChange,
  defaultWorkspaceId: _defaultWorkspaceId,
}: ImportAwsProfileDialogProps) {
  const [state, dispatch] = useReducer(reducer, { step: "upload" });
  const credentialsInputRef = useRef<HTMLInputElement>(null);
  const configInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (
    file: File,
    target: "credentials" | "config"
  ): Promise<void> => {
    if (file.size > MAX_FILE_SIZE) {
      dispatch({
        type: "set-parse-error",
        error: `File too large — AWS config files are normally under 100 KB.`,
      });
      return;
    }
    const content = await file.text();
    dispatch({
      type: target === "credentials" ? "set-credentials" : "set-config",
      content,
    });
  };

  const canParse = !!state.credentials;
  let parsedPreview: ParsedProfile[] = [];
  if (canParse) {
    try {
      parsedPreview = parseAwsProfiles({
        credentials: state.credentials,
        config: state.config,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown parse error";
      if (state.parseError !== message) {
        dispatch({ type: "set-parse-error", error: message });
      }
    }
  }

  const close = () => {
    dispatch({ type: "reset" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import from AWS profile</DialogTitle>
          <DialogDescription>
            Upload your <code>~/.aws/credentials</code> file (and optionally{" "}
            <code>~/.aws/config</code>) to import multiple connections at once.
            Files are parsed in your browser and never uploaded as files.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="credentials-file">credentials file (required)</Label>
            <input
              ref={credentialsInputRef}
              id="credentials-file"
              type="file"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await handleFile(file, "credentials");
              }}
              className="text-sm"
            />
            {state.credentials && (
              <p className="text-xs text-green-600">
                Loaded ({state.credentials.length.toLocaleString()} chars)
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="config-file">config file (optional)</Label>
            <input
              ref={configInputRef}
              id="config-file"
              type="file"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await handleFile(file, "config");
              }}
              className="text-sm"
            />
            {state.config && (
              <p className="text-xs text-green-600">
                Loaded ({state.config.length.toLocaleString()} chars)
              </p>
            )}
          </div>

          {state.parseError && (
            <p className="text-sm text-destructive">{state.parseError}</p>
          )}

          {canParse && !state.parseError && (
            <p className="text-sm text-muted-foreground">
              Found {parsedPreview.length} profile
              {parsedPreview.length === 1 ? "" : "s"}.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!canParse || parsedPreview.length === 0}>
            Next
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
