# Plan 009: Scope object/activity/notes invalidations to the affected `(connectionId, bucket)`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 6dbaee9..HEAD -- src/lib/queries`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (a too-narrow invalidation makes the UI go stale; the safe failure mode is "extra refetch")
- **Depends on**: [[003-clean-verification-baseline]]
- **Category**: perf
- **Planned at**: commit `6dbaee9`, 2026-06-13

## Why this matters

Every object mutation in `src/lib/queries/objects.ts` calls
`queryClient.invalidateQueries({ queryKey: queryKeys.objects.all })`.
That invalidates **every open object list across every connection,
bucket, and prefix**, plus everything in the activity and notes
families (`useInvalidateActivity` and `useInvalidateNotes` are both
`.all`-scoped). Deleting one file in `connection-A/bucket-X/prefix-Y`
forces a refetch in `connection-B/bucket-Z/prefix-W`.

The split-pane and multi-pane UX makes this worse: a user with two
panes open in different buckets sees both panes flash a loading state
on every operation. Activity feeds across the workspace refetch on
every delete.

The fix is targeted invalidation. The query-key factory already
provides per-`(connectionId, bucket)` scoping (`queryKeys.objects.list(connectionId, bucket, prefix)`,
`queryKeys.activity.list(connectionId, bucket, prefix?, key?)`,
`queryKeys.notes.forKey(...)` / `notes.counts(...)`); the mutation
handlers just don't use it.

Compounding source of broadness: copy and move operations span TWO
`(connectionId, bucket)` pairs (source and target). Both must be
invalidated, but not the whole `.all` cone.

## Current state

### Query keys (verified at `6dbaee9`)

`src/lib/queries/keys.ts` exposes:

- `queryKeys.objects.all` → `["objects"]`.
- `queryKeys.objects.list(connectionId, bucket, prefix)` → `["objects", connectionId, bucket, prefix]`.
- `queryKeys.objects.detail(connectionId, bucket, key)` → `["objects", connectionId, bucket, key, "detail"]`.
- `queryKeys.activity.all` → `["activity"]`.
- `queryKeys.activity.list(connectionId, bucket, prefix?, key?)` → `["activity", connectionId, bucket, prefix ?? "", key ?? ""]`.
- `queryKeys.notes.all` → `["notes"]`.
- `queryKeys.notes.forKey(connectionId, bucket, key)` → `["notes", "key", connectionId, bucket, key]`.
- `queryKeys.notes.counts(connectionId, bucket, sortedKeys)` → `["notes", "counts", connectionId, bucket, …]`.
- `queryKeys.notes.countsForBucket(connectionId, bucket)` → `["notes", "counts", connectionId, bucket]` (no key list).

React Query's `invalidateQueries({ queryKey: X })` invalidates `X` and
every key whose array prefix matches. So
`invalidateQueries({ queryKey: ["objects", connectionId, bucket] })`
invalidates every prefix under that connection+bucket — exactly what
we want.

### Invalidation call sites (verified)

`src/lib/queries/objects.ts`:

- `useDeleteObjects` (lines 129–143):
  ```ts
  queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
  invalidateActivity();
  invalidateNotes();
  ```
  Closure already has `connectionId, bucket`. We pass them through.
- `useCreateFolder` (lines 145–157): same pattern, plus invalidateActivity.
- `useCopyObjects` (lines 189–209): uses the mutation's `variables`
  (`sourceConnectionId, sourceBucket, targetConnectionId, targetBucket`).
  Both pairs must invalidate.
- `useMoveObjects` (lines 211–231): same as copy.
- `useUpdateObjectMetadata` (lines 291–304): single connection+bucket
  from `variables`.
- (Other mutations may exist — scan with
  `grep -n "invalidateQueries" src/lib/queries/objects.ts`.)

`src/lib/queries/activity.ts:81-84` —
`useInvalidateActivity` returns `() => qc.invalidateQueries({ queryKey: queryKeys.activity.all })`.
Same pattern in `notes.ts:158-161`. Both must accept optional
`(connectionId?, bucket?)` args and scope when given.

### Other invalidation surfaces (read-only verification)

`grep -rn "invalidateQueries" src/lib/queries` to see the full list.
Touch only the activity/notes/objects mutations listed above; everything
else (`bookmarks`, `share-links`, `versions`, etc.) is out of scope
for this plan — each is a small independent change that should ship
in its own future plan if anyone wants to broaden the cleanup.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Tests | `pnpm test` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Grep — `.all` is gone from object mutations | `grep -n "queryKeys.objects.all" src/lib/queries/objects.ts` | 0 matches (or only in `useObjects` itself, NOT in mutation `onSuccess`) |

## Scope

**In scope** (the only files you should modify):

- `src/lib/queries/objects.ts` — replace `.all` invalidations with scoped ones; pass `(connectionId, bucket)` to `invalidateActivity` and `invalidateNotes`.
- `src/lib/queries/activity.ts` — `useInvalidateActivity` accepts an optional `(connectionId?, bucket?)` arg.
- `src/lib/queries/notes.ts` — `useInvalidateNotes` same.
- `plans/README.md` — status row.

**Out of scope** (do NOT touch):

- `src/lib/queries/keys.ts` — keys factory is correct as-is.
- Cache invalidation in any other domain module (`bookmarks`,
  `share-links`, `versions`, `bucket-stats`, `health`, `multipart-uploads`,
  `tags`, `subscription`, `search`, `searchIndex`, `bucketVersioning`,
  `connections`, `buckets`) — defer.
- React Query stale-time tweaks — out of scope.
- Optimistic updates — out of scope.

## Git workflow

- Branch: `perf/scope-cache-invalidations` off `main`.
- One commit: `perf(queries): scope object/activity/notes invalidations to (connectionId, bucket)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make `useInvalidateActivity` and `useInvalidateNotes` accept a scope

`src/lib/queries/activity.ts:81-84`:

```ts
export function useInvalidateActivity() {
  const queryClient = useQueryClient();
  return (scope?: { connectionId: string; bucket: string }) => {
    if (scope) {
      return queryClient.invalidateQueries({
        // Prefix match: invalidates every activity list for this connection+bucket.
        queryKey: [...queryKeys.activity.all, scope.connectionId, scope.bucket],
      });
    }
    return queryClient.invalidateQueries({ queryKey: queryKeys.activity.all });
  };
}
```

(Backwards compat: existing zero-arg callers keep working with the
broad invalidation until they're updated in Step 2.)

`src/lib/queries/notes.ts:158-161`:

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

(Note: for notes the existing key shape under `.all` includes a
`"counts"` discriminator AND a `forKey` discriminator. The scoped
invalidation above only touches `counts.*` for the bucket. If a
mutation also affects a specific key's note list, the call site
should additionally invalidate
`queryKeys.notes.forKey(connectionId, bucket, key)` — see Step 2's
delete handling. Confirm the existing factory shape against the live
file before pasting.)

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Scope each `objects.ts` mutation

For each mutation in `src/lib/queries/objects.ts`:

#### `useDeleteObjects`

```ts
return useMutation({
  mutationFn: (keys: string[]) => deleteObjects(connectionId, bucket, keys),
  onSuccess: (_data, variables) => {
    // Files were deleted from this connection+bucket: invalidate every prefix's list.
    queryClient.invalidateQueries({
      queryKey: [...queryKeys.objects.all, connectionId, bucket],
    });
    invalidateActivity({ connectionId, bucket });
    invalidateNotes({ connectionId, bucket });
    track({ name: "files_deleted", props: { count: variables.length } });
  },
});
```

#### `useCreateFolder`

Same scope:

```ts
onSuccess: () => {
  queryClient.invalidateQueries({
    queryKey: [...queryKeys.objects.all, connectionId, bucket],
  });
  invalidateActivity({ connectionId, bucket });
  track({ name: "folder_created" });
},
```

#### `useCopyObjects` (dual scope)

```ts
onSuccess: (_data, variables) => {
  // Invalidate source side (activity event recorded; object list unchanged
  // in source — but invalidating the list is cheap and matches today's
  // user expectation that the operation "completed across" both panes).
  queryClient.invalidateQueries({
    queryKey: [...queryKeys.objects.all, variables.sourceConnectionId, variables.sourceBucket],
  });
  queryClient.invalidateQueries({
    queryKey: [...queryKeys.objects.all, variables.targetConnectionId, variables.targetBucket],
  });
  invalidateActivity({ connectionId: variables.sourceConnectionId, bucket: variables.sourceBucket });
  if (
    variables.sourceConnectionId !== variables.targetConnectionId ||
    variables.sourceBucket !== variables.targetBucket
  ) {
    invalidateActivity({ connectionId: variables.targetConnectionId, bucket: variables.targetBucket });
  }
  invalidateNotes({ connectionId: variables.targetConnectionId, bucket: variables.targetBucket });
  track({ name: "files_copied", props: {
    count: variables.sourceKeys.length,
    cross_connection: variables.sourceConnectionId !== variables.targetConnectionId,
  }});
},
```

(Strictly speaking, copy *creates* new note-able files at the target,
not the source — invalidating notes on the target captures the change.
Source-bucket notes don't change.)

#### `useMoveObjects` (dual scope)

Same shape as copy, but BOTH sides have file-set changes, so both get
note invalidations:

```ts
onSuccess: (_data, variables) => {
  queryClient.invalidateQueries({
    queryKey: [...queryKeys.objects.all, variables.sourceConnectionId, variables.sourceBucket],
  });
  queryClient.invalidateQueries({
    queryKey: [...queryKeys.objects.all, variables.targetConnectionId, variables.targetBucket],
  });
  invalidateActivity({ connectionId: variables.sourceConnectionId, bucket: variables.sourceBucket });
  if (
    variables.sourceConnectionId !== variables.targetConnectionId ||
    variables.sourceBucket !== variables.targetBucket
  ) {
    invalidateActivity({ connectionId: variables.targetConnectionId, bucket: variables.targetBucket });
  }
  invalidateNotes({ connectionId: variables.sourceConnectionId, bucket: variables.sourceBucket });
  if (
    variables.sourceConnectionId !== variables.targetConnectionId ||
    variables.sourceBucket !== variables.targetBucket
  ) {
    invalidateNotes({ connectionId: variables.targetConnectionId, bucket: variables.targetBucket });
  }
  track({ name: "files_moved", props: {
    count: variables.sourceKeys.length,
    cross_connection: variables.sourceConnectionId !== variables.targetConnectionId,
  }});
},
```

#### `useUpdateObjectMetadata`

The mutation's variables already include `connectionId, bucket, key`.
Invalidate the affected list and the detail key:

```ts
onSuccess: (_data, variables) => {
  // Invalidate the list (metadata-only mutations don't change membership,
  // but the list response may include the new etag) AND the detail key.
  queryClient.invalidateQueries({
    queryKey: [...queryKeys.objects.all, variables.connectionId, variables.bucket],
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.objects.detail(variables.connectionId, variables.bucket, variables.key),
  });
  invalidateActivity({ connectionId: variables.connectionId, bucket: variables.bucket });
},
```

#### Any other `invalidateQueries({ queryKey: queryKeys.objects.all })` in the file

Scan with:
```bash
grep -n "queryKeys.objects.all" src/lib/queries/objects.ts
```

Each match in a mutation `onSuccess` becomes the same scoped pattern.

**Verify**:
- `grep -n "queryKeys.objects.all" src/lib/queries/objects.ts` → no
  matches inside mutation hooks (only in the `useObjects` `queryKey:
  queryKeys.objects.list(...)` query factory — that's correct).
- `pnpm typecheck && pnpm lint && pnpm test` → exit 0.

### Step 3: Functional smoke walk

Open `pnpm dev`:

1. With two panes pointing at different `(connectionId, bucket)` pairs,
   delete a file in pane A. Confirm pane B does NOT show a loading spinner
   (the React Query devtools will show only pane A's `objects.list(...)`
   query invalidated).
2. With one pane open, copy a folder of files into a new prefix. Confirm
   both source and target prefixes refetch.
3. Update file metadata. Confirm the file detail and the list both
   refresh.
4. With activity drawer open, delete a file. Confirm the activity feed
   in the affected bucket updates; activity feed in another bucket does
   not.

If any flow shows stale data, see STOP conditions.

### Step 4: Composite gate

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm build
```

Expected: exit 0.

## Test plan

No new unit tests in this plan. The signal is the smoke walk in Step 3
plus the grep checks.

If plan 007's API-route test harness has landed, consider adding a unit
test for `useInvalidateActivity({ connectionId, bucket })` — invoke it
with a mock QueryClient and assert which keys were invalidated. Optional;
the change is small and visible enough that the smoke walk is sufficient.

## Done criteria

ALL must hold:

- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` all exit 0.
- [ ] `grep -n "queryKeys.objects.all" src/lib/queries/objects.ts` shows no matches inside `onSuccess` blocks.
- [ ] `useInvalidateActivity` and `useInvalidateNotes` accept an optional `{ connectionId, bucket }` scope and use it when given.
- [ ] The smoke walk in Step 3 confirms pane B does NOT refetch when only pane A's bucket changes.
- [ ] No `src/**` files outside scope are modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- A smoke-walk flow shows stale data (a deletion is not reflected in
  the same-bucket view) — the invalidation key shape is wrong; read the
  exact `queryKey` factory output via the React Query devtools and adjust.
- An `onSuccess` mutation in `objects.ts` doesn't have `connectionId, bucket`
  in scope (e.g. one that takes only an object id). Skip it and note in
  the PR description; that mutation needs a separate scoping design.
- `notes.forKey` queries (the per-key note list inside the info drawer)
  go stale on delete because the scoped notes invalidation only hits
  `counts.*`. If the drawer is open on a key that just got deleted, the
  user may see a stale note list. Decide: either add a per-key
  invalidation to the delete handler (a `keys.forEach(k => qc.invalidateQueries({ queryKey: queryKeys.notes.forKey(connectionId, bucket, k) }))`)
  or accept the staleness because the file is gone anyway. The plan
  defaults to invalidating only counts; surface this in the PR.

## Maintenance notes

- The scoped pattern (`[...queryKeys.X.all, connectionId, bucket]`) only
  works because the key factories were designed with that prefix order.
  If anyone reorders the factory's tuple (`["objects", "list", connectionId, …]`
  vs `["objects", connectionId, bucket, …]`), this plan's invalidations
  break silently. The `notes` factory already has a discriminator in
  position 2 (`"counts"` / `"key"`); the scoping in Step 1 accounts for
  that by including the discriminator. If anyone refactors the key
  factory, audit invalidation sites in lockstep.
- Each follow-up plan that converts an `objects.all` invalidation in
  another file (`share-links/`, `versions/`, `bookmarks/`) should apply
  the same pattern: a `useInvalidateX({ scope })` factory + a scoped
  call in `onSuccess`.
- Reviewer focus: confirm copy/move invalidate BOTH sides only when
  source and target differ — the `!==` checks above are the gate. A
  same-bucket copy should not double-invalidate the same scope.
