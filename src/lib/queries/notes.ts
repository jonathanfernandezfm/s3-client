"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "./keys";

export type FileNoteResponse = {
  id: string;
  authorId: string | null;
  authorDisplayName: string;
  authorImageUrl: string | null;
  bucket: string;
  key: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};

type ListResponse = { notes: FileNoteResponse[] };
type CountsResponse = { counts: Record<string, number> };

async function fetchNotesForKey(
  connectionId: string,
  bucket: string,
  key: string
): Promise<FileNoteResponse[]> {
  const params = new URLSearchParams({ connectionId, bucket, key });
  const r = await fetch(`/api/notes?${params.toString()}`);
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: "Failed" }));
    throw new Error(e.error || "Failed to fetch notes");
  }
  const data = (await r.json()) as ListResponse;
  return data.notes;
}

async function fetchCounts(
  connectionId: string,
  bucket: string,
  keys: string[]
): Promise<Record<string, number>> {
  const r = await fetch(`/api/notes/counts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, bucket, keys }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: "Failed" }));
    throw new Error(e.error || "Failed to fetch counts");
  }
  const data = (await r.json()) as CountsResponse;
  return data.counts;
}

async function postCreate(args: {
  connectionId: string;
  bucket: string;
  key: string;
  body: string;
}): Promise<FileNoteResponse> {
  const r = await fetch(`/api/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: "Failed" }));
    throw new Error(e.error || "Failed to create note");
  }
  return r.json();
}

async function patchUpdate(args: {
  id: string;
  body: string;
}): Promise<FileNoteResponse> {
  const r = await fetch(`/api/notes/${args.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: args.body }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: "Failed" }));
    throw new Error(e.error || "Failed to update note");
  }
  return r.json();
}

async function deleteOne(id: string): Promise<void> {
  const r = await fetch(`/api/notes/${id}`, { method: "DELETE" });
  if (!r.ok && r.status !== 204) {
    const e = await r.json().catch(() => ({ error: "Failed" }));
    throw new Error(e.error || "Failed to delete note");
  }
}

export function useNotesForKey(args: {
  connectionId: string;
  bucket: string;
  key: string;
}) {
  return useQuery({
    queryKey: queryKeys.notes.forKey(args.connectionId, args.bucket, args.key),
    queryFn: () => fetchNotesForKey(args.connectionId, args.bucket, args.key),
    enabled: !!args.connectionId && !!args.bucket && !!args.key,
    staleTime: 60_000,
  });
}

export function useNoteCounts(args: {
  connectionId: string;
  bucket: string;
  keys: string[];
}) {
  const sorted = [...args.keys].sort();
  return useQuery({
    queryKey: queryKeys.notes.counts(args.connectionId, args.bucket, sorted),
    queryFn: () => fetchCounts(args.connectionId, args.bucket, sorted),
    enabled: !!args.connectionId && !!args.bucket && sorted.length > 0,
    staleTime: 60_000,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: postCreate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notes.all });
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: patchUpdate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notes.all });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteOne,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notes.all });
    },
  });
}

export function useInvalidateNotes() {
  const qc = useQueryClient();
  return (scope?: { connectionId: string; bucket: string }) => {
    if (scope) {
      return qc.invalidateQueries({
        queryKey: [...queryKeys.notes.all, "counts", scope.connectionId, scope.bucket],
      });
    }
    return qc.invalidateQueries({ queryKey: queryKeys.notes.all });
  };
}
