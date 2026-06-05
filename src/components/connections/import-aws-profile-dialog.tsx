"use client";

import { useReducer, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useWorkspaces } from "@/lib/queries/workspaces";
import {
  useImportAwsProfiles,
  type ImportProfilePayload,
  type ImportProfileResult,
} from "@/lib/queries/connections";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

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

interface SelectState {
  step: "select";
  profiles: ParsedProfile[];
  selection: Map<string, { selected: boolean; name: string }>;
  workspaceId: string;
}

interface ImportingState {
  step: "importing";
  count: number;
  previousSelect: SelectState;
}

interface ResultsState {
  step: "results";
  results: ImportProfileResult[];
}

type State = UploadState | SelectState | ImportingState | ResultsState;

type Action =
  | { type: "set-credentials"; content: string }
  | { type: "set-config"; content: string }
  | { type: "set-parse-error"; error: string }
  | {
      type: "advance-to-select";
      profiles: ParsedProfile[];
      defaultWorkspaceId: string;
    }
  | { type: "back-to-upload" }
  | { type: "toggle-profile"; name: string }
  | { type: "rename-profile"; name: string; newName: string }
  | { type: "set-all"; selected: boolean }
  | { type: "set-workspace"; workspaceId: string }
  | { type: "start-importing"; count: number }
  | { type: "import-failed" }
  | { type: "show-results"; results: ImportProfileResult[] }
  | { type: "reset" };

function makeInitialSelection(
  profiles: ParsedProfile[]
): Map<string, { selected: boolean; name: string }> {
  const map = new Map<string, { selected: boolean; name: string }>();
  for (const p of profiles) {
    map.set(p.name, { selected: p.kind === "static", name: p.name });
  }
  return map;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set-credentials":
      if (state.step !== "upload") return state;
      return { ...state, credentials: action.content, parseError: undefined };
    case "set-config":
      if (state.step !== "upload") return state;
      return { ...state, config: action.content, parseError: undefined };
    case "set-parse-error":
      if (state.step !== "upload") return state;
      return { ...state, parseError: action.error };
    case "advance-to-select":
      return {
        step: "select",
        profiles: action.profiles,
        selection: makeInitialSelection(action.profiles),
        workspaceId: action.defaultWorkspaceId,
      };
    case "back-to-upload":
      return { step: "upload" };
    case "toggle-profile": {
      if (state.step !== "select") return state;
      const next = new Map(state.selection);
      const entry = next.get(action.name);
      if (entry) next.set(action.name, { ...entry, selected: !entry.selected });
      return { ...state, selection: next };
    }
    case "rename-profile": {
      if (state.step !== "select") return state;
      const next = new Map(state.selection);
      const entry = next.get(action.name);
      if (entry) next.set(action.name, { ...entry, name: action.newName });
      return { ...state, selection: next };
    }
    case "set-all": {
      if (state.step !== "select") return state;
      const next = new Map(state.selection);
      for (const [key, value] of next) {
        const profile = state.profiles.find((p) => p.name === key);
        if (profile?.kind === "static") {
          next.set(key, { ...value, selected: action.selected });
        }
      }
      return { ...state, selection: next };
    }
    case "set-workspace":
      if (state.step !== "select") return state;
      return { ...state, workspaceId: action.workspaceId };
    case "start-importing":
      if (state.step !== "select") return state;
      return { step: "importing", count: action.count, previousSelect: state };
    case "import-failed":
      if (state.step !== "importing") return state;
      return state.previousSelect;
    case "show-results":
      return { step: "results", results: action.results };
    case "reset":
      return { step: "upload" };
  }
}

const MAX_FILE_SIZE = 1024 * 1024;

export function ImportAwsProfileDialog({
  open,
  onOpenChange,
  defaultWorkspaceId,
}: ImportAwsProfileDialogProps) {
  const [state, dispatch] = useReducer(reducer, { step: "upload" });
  const { data: workspaces = [] } = useWorkspaces();
  const importMutation = useImportAwsProfiles();
  const { addNotification } = useNotificationStore();

  const adminWorkspaces = useMemo(
    () => workspaces.filter((w) => w.role === "ADMIN"),
    [workspaces]
  );

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

  const close = () => {
    dispatch({ type: "reset" });
    onOpenChange(false);
  };

  const handleImport = async () => {
    if (state.step !== "select") return;
    const payload: ImportProfilePayload[] = [];
    for (const profile of state.profiles) {
      if (profile.kind !== "static") continue;
      const sel = state.selection.get(profile.name);
      if (!sel?.selected) continue;
      payload.push({
        name: sel.name.trim(),
        region: profile.region,
        accessKeyId: profile.accessKeyId,
        secretAccessKey: profile.secretAccessKey,
      });
    }
    if (payload.length === 0) return;
    dispatch({ type: "start-importing", count: payload.length });
    try {
      const response = await importMutation.mutateAsync({
        workspaceId: state.workspaceId,
        profiles: payload,
      });
      dispatch({ type: "show-results", results: response.results });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to import";
      addNotification({
        type: "error",
        title: "Import failed",
        error: message,
        status: "error",
      });
      dispatch({ type: "import-failed" });
    }
  };

  if (state.step === "upload") {
    let parsedPreview: ParsedProfile[] = [];
    if (state.credentials) {
      try {
        parsedPreview = parseAwsProfiles({
          credentials: state.credentials,
          config: state.config,
        });
      } catch {
        parsedPreview = [];
      }
    }

    const fallbackWorkspaceId =
      defaultWorkspaceId ??
      adminWorkspaces.find((w) => w.type === "PERSONAL")?.id ??
      adminWorkspaces[0]?.id ??
      "";

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

            {state.credentials && !state.parseError && (
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
            <Button
              disabled={!state.credentials || parsedPreview.length === 0}
              onClick={() =>
                dispatch({
                  type: "advance-to-select",
                  profiles: parsedPreview,
                  defaultWorkspaceId: fallbackWorkspaceId,
                })
              }
            >
              Next
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (state.step === "select") {
    const importableCount = Array.from(state.selection.entries()).filter(
      ([profileName, sel]) => {
        const profile = state.profiles.find((p) => p.name === profileName);
        return profile?.kind === "static" && sel.selected && sel.name.trim().length > 0;
      }
    ).length;
    const allNamesValid = Array.from(state.selection.entries()).every(
      ([profileName, sel]) => {
        const profile = state.profiles.find((p) => p.name === profileName);
        if (profile?.kind !== "static") return true;
        if (!sel.selected) return true;
        return sel.name.trim().length > 0;
      }
    );

    return (
      <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {state.profiles.length} profile{state.profiles.length === 1 ? "" : "s"} found,{" "}
              {importableCount} importable
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {adminWorkspaces.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="import-workspace">Workspace</Label>
                <select
                  id="import-workspace"
                  value={state.workspaceId}
                  onChange={(e) =>
                    dispatch({ type: "set-workspace", workspaceId: e.target.value })
                  }
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                >
                  {adminWorkspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name} ({ws.type === "PERSONAL" ? "Personal" : "Team"})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                className="underline text-muted-foreground"
                onClick={() => dispatch({ type: "set-all", selected: true })}
              >
                Select all importable
              </button>
              <button
                type="button"
                className="underline text-muted-foreground"
                onClick={() => dispatch({ type: "set-all", selected: false })}
              >
                Deselect all
              </button>
            </div>

            <div className="border rounded-md divide-y max-h-[40vh] overflow-y-auto">
              {state.profiles.map((profile) => {
                const sel = state.selection.get(profile.name);
                const isStatic = profile.kind === "static";
                return (
                  <div
                    key={profile.name}
                    className="flex items-center gap-3 p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={!!sel?.selected}
                      disabled={!isStatic}
                      onChange={() =>
                        dispatch({ type: "toggle-profile", name: profile.name })
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={isStatic ? "font-medium" : "text-muted-foreground"}>
                          {profile.name}
                        </span>
                        {isStatic && (
                          <span className="text-xs text-muted-foreground">
                            {profile.region}
                          </span>
                        )}
                      </div>
                      {!isStatic && (
                        <p className="text-xs text-muted-foreground">
                          {"reason" in profile ? profile.reason : ""}
                        </p>
                      )}
                    </div>
                    {isStatic && sel && (
                      <Input
                        className="w-48 h-8 text-xs"
                        value={sel.name}
                        onChange={(e) =>
                          dispatch({
                            type: "rename-profile",
                            name: profile.name,
                            newName: e.target.value,
                          })
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {!allNamesValid && (
              <p className="text-sm text-destructive">
                Connection names cannot be empty.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => dispatch({ type: "back-to-upload" })}
            >
              Back
            </Button>
            <Button
              disabled={importableCount === 0 || !allNamesValid}
              onClick={handleImport}
            >
              Import {importableCount} profile{importableCount === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (state.step === "importing") {
    return (
      <Dialog open={open} onOpenChange={() => undefined}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Validating {state.count} profile{state.count === 1 ? "" : "s"}…</DialogTitle>
            <DialogDescription>
              Testing each profile's credentials against AWS S3. This may take a few seconds.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-6">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // state.step === "results"
  const savedCount = state.results.filter((r) => r.status === "saved").length;
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Imported {savedCount} of {state.results.length} profile{state.results.length === 1 ? "" : "s"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1 max-h-[40vh] overflow-y-auto">
          {state.results.map((result) => (
            <div
              key={result.name}
              className="flex items-center gap-2 p-2 text-sm border-b last:border-b-0"
            >
              {result.status === "saved" ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
              )}
              <span className="flex-1 min-w-0 truncate">{result.name}</span>
              <span className="text-xs text-muted-foreground">
                {result.status === "saved" ? "Saved" : result.error || "Invalid"}
              </span>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={close}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
