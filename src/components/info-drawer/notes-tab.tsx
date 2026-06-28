"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { useInfoDrawerStore } from "@/lib/stores/info-drawer-store";
import {
  useNotesForKey,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  type FileNoteResponse,
} from "@/lib/queries/notes";
import { Avatar } from "./avatar";
import { formatRelativeTime } from "./format-time";

const MAX_BODY = 4000;
const SOFT_COUNTER_THRESHOLD = 3500;

function isEdited(note: FileNoteResponse): boolean {
  const c = new Date(note.createdAt).getTime();
  const u = new Date(note.updatedAt).getTime();
  return u - c > 60_000;
}

function NoteRow({ note, connectionId, bucket, noteKey }: {
  note: FileNoteResponse;
  connectionId: string;
  bucket: string;
  noteKey: string;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");
  const [draft, setDraft] = useState(note.body);
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const addNotification = useNotificationStore((s) => s.addNotification);

  async function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === note.body || trimmed.length > MAX_BODY) {
      setMode("view");
      setDraft(note.body);
      return;
    }
    try {
      await updateNote.mutateAsync({ id: note.id, body: trimmed, connectionId, bucket, key: noteKey });
      setMode("view");
    } catch (err) {
      addNotification({
        type: "error",
        title: "Couldn't save",
        error: err instanceof Error ? err.message : "Unknown error",
        status: "error",
      });
    }
  }

  async function handleDelete() {
    try {
      await deleteNote.mutateAsync({ id: note.id, connectionId, bucket, key: noteKey });
    } catch (err) {
      addNotification({
        type: "error",
        title: "Couldn't delete",
        error: err instanceof Error ? err.message : "Unknown error",
        status: "error",
      });
    }
  }

  return (
    <div className="px-4 py-3 border-b border-border last:border-b-0">
      <div className="flex items-start gap-2">
        <div className="mt-0.5">
          <Avatar
            userId={note.authorId}
            displayName={note.authorDisplayName}
            imageUrl={note.authorImageUrl}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">{note.authorDisplayName}</p>
            <div className="flex items-center gap-1 shrink-0">
              <time
                className="text-xs text-muted-foreground"
                title={new Date(note.createdAt).toISOString()}
              >
                {formatRelativeTime(note.createdAt)}
                {isEdited(note) && (
                  <span className="ml-1 text-muted-foreground/70">(edited)</span>
                )}
              </time>
              {note.canEdit && mode === "view" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Note options">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setMode("edit")}>
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setMode("confirm-delete")}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {mode === "view" && (
            <p className="text-sm text-foreground whitespace-pre-wrap mt-1 break-words">
              {note.body}
            </p>
          )}

          {mode === "edit" && (
            <div className="mt-1 space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setMode("view");
                    setDraft(note.body);
                  } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    handleSave();
                  }
                }}
                rows={Math.min(8, Math.max(3, draft.split("\n").length))}
                maxLength={MAX_BODY}
                className="w-full text-sm rounded border border-input bg-background p-2 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                autoFocus
              />
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-xs ${
                    draft.length >= SOFT_COUNTER_THRESHOLD
                      ? "text-amber-500"
                      : "text-muted-foreground/0"
                  }`}
                >
                  {draft.length >= SOFT_COUNTER_THRESHOLD
                    ? `${draft.length} / ${MAX_BODY}`
                    : ""}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMode("view");
                      setDraft(note.body);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={
                      !draft.trim() ||
                      draft.trim() === note.body ||
                      draft.length > MAX_BODY ||
                      updateNote.isPending
                    }
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}

          {mode === "confirm-delete" && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Delete this note?</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMode("view")}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleteNote.isPending}
              >
                Yes
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Composer({
  connectionId,
  bucket,
  noteKey,
}: {
  connectionId: string;
  bucket: string;
  noteKey: string;
}) {
  const [body, setBody] = useState("");
  const createNote = useCreateNote();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing pattern; reset body when note key changes is intentional, real fix tracked separately
    setBody("");
  }, [connectionId, bucket, noteKey]);

  async function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed || trimmed.length > MAX_BODY) return;
    try {
      await createNote.mutateAsync({
        connectionId,
        bucket,
        key: noteKey,
        body: trimmed,
      });
      setBody("");
    } catch (err) {
      addNotification({
        type: "error",
        title: "Couldn't add note",
        error: err instanceof Error ? err.message : "Unknown error",
        status: "error",
      });
    }
  }

  return (
    <div className="border-t border-border p-3 space-y-2 shrink-0">
      <textarea
        ref={taRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder="Add a note..."
        rows={Math.min(8, Math.max(3, body.split("\n").length))}
        maxLength={MAX_BODY}
        className="w-full text-sm rounded border border-input bg-background p-2 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
      />
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-xs ${
            body.length >= SOFT_COUNTER_THRESHOLD ? "text-amber-500" : ""
          }`}
        >
          {body.length >= SOFT_COUNTER_THRESHOLD
            ? `${body.length} / ${MAX_BODY}`
            : ""}
        </span>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={
            !body.trim() || body.length > MAX_BODY || createNote.isPending
          }
        >
          Add note
        </Button>
      </div>
    </div>
  );
}

export function NotesTab() {
  const { scope } = useInfoDrawerStore();

  const noteKey =
    scope?.prefix && scope.prefix.length > 0 ? scope.prefix : null;

  const enabled =
    !!scope?.connectionId && !!scope?.bucket && !!noteKey;

  const { data, isLoading, isError, refetch } = useNotesForKey({
    connectionId: scope?.connectionId ?? "",
    bucket: scope?.bucket ?? "",
    key: noteKey ?? "",
  });

  if (!enabled) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Navigate into a folder to add notes
        </p>
      </div>
    );
  }

  const notes = data ?? [];

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 h-32 px-4">
            <p className="text-sm text-muted-foreground">Couldn&apos;t load notes</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : notes.length === 0 ? (
          <div className="flex items-center justify-center h-32 px-4 text-center">
            <p className="text-sm text-muted-foreground">No notes yet</p>
          </div>
        ) : (
          <div>
            {notes.map((n) => (
              <NoteRow
                key={n.id}
                note={n}
                connectionId={scope!.connectionId}
                bucket={scope!.bucket}
                noteKey={noteKey!}
              />
            ))}
          </div>
        )}
      </div>
      <Composer
        connectionId={scope!.connectionId}
        bucket={scope!.bucket}
        noteKey={noteKey!}
      />
    </>
  );
}
