"use client";

import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { useInvalidateNotes } from "./notes";

export interface RenameArgs {
  connectionId: string;
  bucket: string;
  sourceKey: string;
  targetKey: string;
}

export interface TagArgs {
  connectionId: string;
  bucket: string;
  key: string;
  tags: Array<{ key: string; value: string }>;
}

export interface DeleteOneArgs {
  connectionId: string;
  bucket: string;
  key: string;
}

async function postJson(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }
}

export async function renameObject(args: RenameArgs): Promise<void> {
  await postJson("/api/objects/rename", args);
}

export async function setObjectTags(args: TagArgs): Promise<void> {
  await postJson("/api/objects/tag", args);
}

export async function deleteOneObject(args: DeleteOneArgs): Promise<void> {
  await postJson("/api/objects/delete", {
    connectionId: args.connectionId,
    bucket: args.bucket,
    keys: [args.key],
  });
}

export function useInvalidateObjects() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
}

export function useInvalidateNotesAndObjects() {
  const queryClient = useQueryClient();
  const invalidateNotes = useInvalidateNotes();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
    invalidateNotes();
  };
}
