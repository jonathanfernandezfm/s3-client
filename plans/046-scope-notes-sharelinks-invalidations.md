# Plan 046: Scope note and share-link mutation invalidations to the affected `(connectionId, bucket)` instead of the whole resource

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5f963f5..HEAD -- src/lib/queries/keys.ts src/lib/queries/notes.ts src/lib/queries/share-links.ts src/components/info-drawer/notes-tab.tsx src/components/shares/share-dialog.tsx src/components/shares/share-list-table.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `5f963f5`, 2026-06-23

## Why this matters

Every note and share-link mutation currently invalidates the **entire**
resource cache (`queryKeys.notes.all` / `queryKeys.shareLinks.all`). Adding one
note in bucket A refetches the note-count queries for *every* open bucket and
folder; revoking one share link refetches *all* share-link lists and counts
across every connection. Plan 009 scoped the object/activity/notes-list
invalidations on the *object-mutation* paths, and `notes.ts` even ships a
correctly-scoped helper (`useInvalidateNotes`, lines 158–168) — but the note
**CRUD** hooks (`useCreateNote`/`useUpdateNote`/`useDeleteNote`) and **all**
share-link hooks were left on `.all`. This plan brings those mutations to the
same `(connectionId, bucket)` scoping the rest of the app already uses, removing
the avalanche of cross-bucket refetches on each note/share edit.

This is a lower-leverage finding than a hot-path N+1 (note/share CRUD is
user-initiated and infrequent), but it is a clean, mechanical alignment with an
established pattern.

## Current state

### Query-key factory — `src/lib/queries/keys.ts`

Notes already have the scoped keys this plan needs (lines 37–45):

```ts
  notes: {
    all: ["notes"] as const,
    forKey: (connectionId, bucket, key) => [...queryKeys.notes.all, "key", connectionId, bucket, key],
    counts: (connectionId, bucket, sortedKeys) => [...queryKeys.notes.all, "counts", connectionId, bucket, sortedKeys.join("|")],
    countsForBucket: (connectionId, bucket) => [...queryKeys.notes.all, "counts", connectionId, bucket],
  },
```

`countsForBucket(cid, bucket)` is a **prefix** of every `counts(cid, bucket, …)`
key, so invalidating it refreshes all per-folder note-count queries in that
bucket. `forKey(cid, bucket, key)` targets the open notes list.

Share-links (lines 53–61) have `counts` and `list` but **no** prefix helpers for
"all lists for a connection" or "all counts for a bucket":

```ts
  shareLinks: {
    all: ["share-links"] as const,
    list: (connectionId, bucket?, key?) => [...queryKeys.shareLinks.all, "list", connectionId, bucket ?? "", key ?? ""],
    detail: (id) => [...queryKeys.shareLinks.all, "detail", id],
    counts: (connectionId, bucket, sortedKeys) => [...queryKeys.shareLinks.all, "counts", connectionId, bucket, sortedKeys.join("|")],
  },
```

Note: `list(connectionId)` produces `[…, "list", connectionId, "", ""]`, which is
**not** a prefix of `list(connectionId, bucket, key)` — so you cannot invalidate
both the management table (`list(connectionId)`) and the per-file dialog list
(`list(connectionId, bucket, key)`) with a single `list(connectionId)` call. You
need a true prefix helper.

### Notes mutations — `src/lib/queries/notes.ts` (lines 128–156)

```ts
export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: postCreate,                       // postCreate args: {connectionId, bucket, key, body}
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.notes.all }); },
  });
}
export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: patchUpdate,                       // patchUpdate args: {id, body}
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.notes.all }); },
  });
}
export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteOne,                         // deleteOne arg: id (string)
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.notes.all }); },
  });
}
```

**Exemplar for the scoped shape** (same file, lines 158–168) — copy this style:

```ts
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
```

### Share-link mutations — `src/lib/queries/share-links.ts`

- `useCreateShareLink` (lines 55–72): `mutationFn` input is `CreateInput`
  (`{connectionId, bucket, key, …}`, lines 44–53); `onSuccess` →
  `invalidateQueries({ queryKey: queryKeys.shareLinks.all })` + `track(...)`.
- `useRevokeShareLink` (lines 97–109): `mutationFn` input is `id: string`;
  `onSuccess` → `.all`.
- `useEditShareLink` (lines 111–130): `mutationFn` input is
  `{ id: string; patch: {...} }`; `onSuccess` → `.all`.

### Consumers

- `src/components/info-drawer/notes-tab.tsx`:
  - `Composer` (lines 210–289) calls `createNote.mutateAsync({ connectionId, bucket, key: noteKey, body })` — **already carries scope** (no change needed for create).
  - `NoteRow` (lines 33–208) calls `updateNote.mutateAsync({ id: note.id, body: trimmed })` (line 48) and `deleteNote.mutateAsync(note.id)` (line 62) — **needs scope threaded in**. `NoteRow` does not currently receive `connectionId`/`bucket`/`key`; the parent `NotesTab` has them (`scope!.connectionId`, `scope!.bucket`, `noteKey!`, lines 291–349).
- `src/components/shares/share-dialog.tsx`: has `connectionId`, `bucket`,
  `fileKey` in scope (line 39); `create.mutateAsync({ connectionId, bucket, … })`
  already carries scope (line 69); `revoke.mutate(s.id)` (line 134) needs scope.
- `src/components/shares/share-list-table.tsx`: has `connectionId` prop (line 24);
  each row `s` is a `ShareLinkResponse` with `s.bucket` and `s.key`;
  `edit.mutate({ id: s.id, patch: {...} })` (lines 100–103) and
  `revoke.mutate(s.id)` (line 114) need scope.
- `useCreateShareLink` is also used by `src/components/browser/bulk-ops-panel.tsx`
  (batch create) — it passes `CreateInput` with `connectionId`/`bucket`, so the
  variables-based `onSuccess` covers it **with no consumer change**.

### React Query version note

This repo uses TanStack Query v5 (`@tanstack/react-query` ^5). In v5, `onSuccess`
receives `(data, variables, context)`. This plan reads `variables` in `onSuccess`
to get the mutation's scope — no need to capture it in `onMutate` context.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `pnpm typecheck`   | exit 0, no errors   |
| Lint      | `pnpm lint`        | exit 0              |
| Tests     | `pnpm test`        | all pass            |

## Scope

**In scope** (the only files you should modify):
- `src/lib/queries/keys.ts` (add two share-link prefix helpers)
- `src/lib/queries/notes.ts` (scope the 3 CRUD mutations)
- `src/lib/queries/share-links.ts` (scope the 3 mutations; widen revoke/edit inputs)
- `src/components/info-drawer/notes-tab.tsx` (thread scope into `NoteRow`)
- `src/components/shares/share-dialog.tsx` (scope `revoke.mutate`)
- `src/components/shares/share-list-table.tsx` (scope `revoke`/`edit` mutates)

**Out of scope** (do NOT touch):
- `useInvalidateNotes` (already correct).
- The object/activity invalidation paths (plan 009 handled those).
- `postCreate`/`patchUpdate`/`deleteOne` request functions in `notes.ts` — do not
  change what they send to the API; only widen the *mutation hook* input types.
- The `/api/notes` and `/api/share-links` route handlers — server-side unchanged.

## Git workflow

- Branch: `advisor/046-scope-notes-sharelink-invalidations`
- Commit message style: conventional commits, e.g.
  `perf: scope note and share-link cache invalidations to (connectionId, bucket)`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add share-link prefix helpers to the key factory

In `src/lib/queries/keys.ts`, inside the `shareLinks` object, add two helpers
(place `listByConnection` after `list`, and `countsForBucket` after `counts`):

```ts
    listByConnection: (connectionId: string) =>
      [...queryKeys.shareLinks.all, "list", connectionId] as const,
    countsForBucket: (connectionId: string, bucket: string) =>
      [...queryKeys.shareLinks.all, "counts", connectionId, bucket] as const,
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Scope the note CRUD mutations

In `src/lib/queries/notes.ts`, replace the three `onSuccess` callbacks. Read the
mutation `variables` to scope each invalidation.

`useCreateNote` — variables already include `{connectionId, bucket, key}`:

```ts
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.notes.forKey(variables.connectionId, variables.bucket, variables.key) });
      qc.invalidateQueries({ queryKey: queryKeys.notes.countsForBucket(variables.connectionId, variables.bucket) });
    },
```

`useUpdateNote` — widen the mutation input so `onSuccess` has the scope, while
still sending only `{id, body}` to the API:

```ts
export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: string; connectionId: string; bucket: string; key: string }) =>
      patchUpdate({ id: args.id, body: args.body }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.notes.forKey(variables.connectionId, variables.bucket, variables.key) });
      qc.invalidateQueries({ queryKey: queryKeys.notes.countsForBucket(variables.connectionId, variables.bucket) });
    },
  });
}
```

`useDeleteNote` — same widening:

```ts
export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; connectionId: string; bucket: string; key: string }) =>
      deleteOne(args.id),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.notes.forKey(variables.connectionId, variables.bucket, variables.key) });
      qc.invalidateQueries({ queryKey: queryKeys.notes.countsForBucket(variables.connectionId, variables.bucket) });
    },
  });
}
```

**Verify**: `pnpm typecheck` → the two consumers in `notes-tab.tsx` will now
error (wrong mutate args) — that's expected; fixed in Step 4.

### Step 3: Scope the share-link mutations

In `src/lib/queries/share-links.ts`:

`useCreateShareLink` — `onSuccess` reads `variables` (a `CreateInput`):

```ts
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.shareLinks.listByConnection(variables.connectionId) });
      qc.invalidateQueries({ queryKey: queryKeys.shareLinks.countsForBucket(variables.connectionId, variables.bucket) });
      track({ name: "share_link_created" });
    },
```

`useRevokeShareLink` — widen the input to carry scope:

```ts
export function useRevokeShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; connectionId: string; bucket: string; key?: string }) => {
      const r = await fetch(`/api/share-links/${args.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to revoke share link");
      return (await r.json()) as { revokedAt: string | null };
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.shareLinks.listByConnection(variables.connectionId) });
      qc.invalidateQueries({ queryKey: queryKeys.shareLinks.countsForBucket(variables.connectionId, variables.bucket) });
    },
  });
}
```

`useEditShareLink` — add scope alongside the existing `{id, patch}`:

```ts
export function useEditShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      patch: { expiresAt?: string | null; maxUses?: number | null; description?: string | null };
      connectionId: string;
      bucket: string;
      key?: string;
    }) => {
      const r = await fetch(`/api/share-links/${args.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args.patch),
      });
      if (!r.ok) throw new Error("Failed to update share link");
      return (await r.json()) as { shareLink: ShareLinkResponse };
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.shareLinks.listByConnection(variables.connectionId) });
      qc.invalidateQueries({ queryKey: queryKeys.shareLinks.countsForBucket(variables.connectionId, variables.bucket) });
    },
  });
}
```

**Verify**: `pnpm typecheck` → the share consumers will now error — expected;
fixed in Step 5.

### Step 4: Thread scope through `NoteRow`

In `src/components/info-drawer/notes-tab.tsx`:

1. Widen `NoteRow`'s props (line 33) to receive scope:
   ```ts
   function NoteRow({ note, connectionId, bucket, noteKey }: {
     note: FileNoteResponse;
     connectionId: string;
     bucket: string;
     noteKey: string;
   }) {
   ```
2. In `handleSave` (line 48):
   ```ts
   await updateNote.mutateAsync({ id: note.id, body: trimmed, connectionId, bucket, key: noteKey });
   ```
3. In `handleDelete` (line 62):
   ```ts
   await deleteNote.mutateAsync({ id: note.id, connectionId, bucket, key: noteKey });
   ```
4. In `NotesTab`'s render (line 338–339), pass the scope down:
   ```tsx
   {notes.map((n) => (
     <NoteRow
       key={n.id}
       note={n}
       connectionId={scope!.connectionId}
       bucket={scope!.bucket}
       noteKey={noteKey!}
     />
   ))}
   ```
   (`scope!` and `noteKey!` are already proven non-null here — the component
   returns early when `enabled` is false, lines 297–314.)

**Verify**: `pnpm typecheck` → no errors in `notes-tab.tsx`.

### Step 5: Scope the share-link consumers

In `src/components/shares/share-dialog.tsx`, change `revoke.mutate(s.id)`
(line 134) to:

```ts
onClick={() => revoke.mutate({ id: s.id, connectionId, bucket, key: fileKey })}
```

In `src/components/shares/share-list-table.tsx`:

- `revoke.mutate(s.id)` (line 114) →
  ```ts
  onClick={() => revoke.mutate({ id: s.id, connectionId, bucket: s.bucket, key: s.key })}
  ```
- `edit.mutate({ id: s.id, patch: {...} })` (lines 100–103) → add scope:
  ```ts
  edit.mutate({
    id: s.id,
    patch: { expiresAt: new Date(Date.now() + EXTEND_BY_MS).toISOString() },
    connectionId,
    bucket: s.bucket,
    key: s.key,
  })
  ```

**Verify**: `pnpm typecheck` → exit 0 across the whole repo.

### Step 6: Full gate

**Verify**:
- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0
- `pnpm test` → all pass

## Test plan

- No new unit tests required — this is a cache-invalidation scoping change with
  no API/contract change, and there is no test harness for React Query
  invalidation behavior in this repo.
- Manual smoke (if a browser is available):
  1. Open a folder, add/edit/delete a note → the notes list and that folder's
     note-count badge update; note badges in *other* buckets do not refetch
     (check the Network tab: only `notes/counts` for the current bucket fires).
  2. Create/revoke/extend a share link from the share dialog and from the shares
     table → the share count on the file and the shares table both update.
- Existing suite stays green: `pnpm test` → all pass (the `notes`/`share-links`
  db tests under `src/lib/db/` are server-side and unaffected).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0
- [ ] `grep -n "queryKeys.notes.all" src/lib/queries/notes.ts` → matches ONLY in
      `useInvalidateNotes` (the CRUD mutations no longer use `.all`)
- [ ] `grep -n "queryKeys.shareLinks.all\b" src/lib/queries/share-links.ts` → no
      bare `.all` invalidations remain in the three mutations (only the new
      `listByConnection`/`countsForBucket` helpers, which reference `.all`
      internally in `keys.ts`)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- `ShareLinkResponse` does not have `bucket` and `key` fields (Step 5 relies on
  `s.bucket`/`s.key`) — without them the table cannot scope revoke/edit.
- After the change, the manual smoke shows a note/share edit **not** refreshing
  the visible list/count (under-invalidation) — that means a key prefix is wrong;
  report it rather than reverting to `.all`.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- The remaining `.all` fallback in `useInvalidateNotes` is intentional (callers
  with no scope). Leave it.
- If share links gain a "list by bucket" view that uses a key between
  `listByConnection` and the per-key `list`, confirm `listByConnection`'s prefix
  still covers it (it will, as long as `connectionId` stays in position 3).
- Reviewer should scrutinize that each mutation invalidates **both** the list/
  detail query and the counts query for its scope — missing one causes a stale
  badge or a stale list. The pairing (`forKey`+`countsForBucket` for notes,
  `listByConnection`+`countsForBucket` for shares) is the thing to check.
- Deferred (not in this plan): the same `.all` pattern does not exist elsewhere
  after plan 009 + this plan; no further invalidation-scoping work is queued.
