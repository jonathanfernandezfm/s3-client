# Plan 044: Memoize derived object lists in the file browser so filtering and key derivation stop running every render

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5f963f5..HEAD -- src/components/browser/file-browser.tsx src/components/browser/bulk-ops-panel.tsx`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `5f963f5`, 2026-06-23

## Why this matters

`FileBrowser` re-renders on many unrelated state changes (drag state, selection,
dialogs, store updates). On every render it recomputes four derived arrays over
the full object list **without memoization**: `folderKeys`, `fileKeys`,
`visibleObjects` (tag filter), and `displayedObjects` (name filter). Two costs
follow. First, in a folder with hundreds/thousands of objects, each keystroke in
the name-filter box re-filters the entire list synchronously on the render
thread. Second — and worse — `folderKeys` and `fileKeys` are passed straight
into the `useNoteCounts`, `useShareLinkCounts`, and `useFileTags` query hooks,
which build their cache keys from those arrays; recreating the arrays every
render churns referential identity through those hooks (they defensively
`[...keys].sort()` each time to compensate). Memoizing these derivations is a
small, low-risk change that removes repeated O(N) work from the hottest screen
in the app. `BulkOpsPanel` has the identical un-memoized `selection` filter.

## Current state

**`src/components/browser/file-browser.tsx`** — imports at line 3:

```ts
import { useState, useCallback, useEffect, useRef } from "react";
```

Note: `useMemo` is **not** currently imported.

The derived data, lines 139–184 (un-memoized):

```ts
  const folderKeys = objects
    .filter((o) => o.isFolder)
    .map((o) => o.key);
  const folderNoteCountsQuery = useNoteCounts({
    connectionId,
    bucket,
    keys: folderKeys,
  });
  const folderNoteCounts = folderNoteCountsQuery.data ?? {};

  const fileKeys = objects
    .filter((o) => !o.isFolder)
    .map((o) => o.key);
  const fileShareCountsQuery = useShareLinkCounts({
    connectionId,
    bucket,
    keys: fileKeys,
  });
  const fileShareCounts = fileShareCountsQuery.data ?? {};

  const fileTagsQuery = useFileTags({ connectionId, bucket, keys: fileKeys });
  const fileTags = fileTagsQuery.data ?? {};
  const folderTagValues = distinctTagValues(fileTags);

  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState("");

  useEffect(() => {
    setActiveTag(null);
    setNameFilter("");
  }, [connectionId, bucket, currentPath]);

  const handleTagToggle = useCallback(
    (tag: string) => {
      setActiveTag((prev) => (prev === tag ? null : tag));
      clearSelection(paneId);
    },
    [clearSelection, paneId]
  );

  const visibleObjects = activeTag
    ? objects.filter(
        (o) => o.isFolder || (fileTags[o.key] ?? []).includes(activeTag)
      )
    : objects;
  const displayedObjects = filterObjectsByName(visibleObjects, nameFilter);
```

`objects` comes from `useObjects(...)` (line 120–127). `filterObjectsByName`
is imported from `@/lib/browser/name-filter` (line 43). `distinctTagValues`
from `@/lib/tags` (line 41).

**`src/components/browser/bulk-ops-panel.tsx`** — line 122 (un-memoized):

```ts
  const selection: S3Object[] = objects.filter((o) => selectedItems.has(o.key));
```

### Repo conventions to follow

- This codebase already uses `useMemo` for exactly this kind of derivation —
  see `src/components/browser/file-gallery.tsx:74-95`, where `folderObjects`,
  `imageObjects`, `otherObjects`, `imageKeys`, and `orderedKeys` are all
  `useMemo`'d over `[objects]`. Match that style precisely.
- `useCallback` is already used in `file-browser.tsx` (e.g. `handleTagToggle`).

## Commands you will need

| Purpose   | Command                                                  | Expected on success |
|-----------|----------------------------------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                                          | exit 0, no errors   |
| Lint      | `pnpm lint`                                               | exit 0              |
| Tests     | `pnpm test`                                               | all pass            |

## Scope

**In scope** (the only files you should modify):
- `src/components/browser/file-browser.tsx`
- `src/components/browser/bulk-ops-panel.tsx`

**Out of scope** (do NOT touch):
- `src/lib/browser/name-filter.ts` and its test — the filter logic is correct;
  only its call site needs memoizing.
- The query hooks (`useNoteCounts`, `useShareLinkCounts`, `useFileTags`) — do
  not change their signatures.
- `file-gallery.tsx` / `file-list.tsx` / `file-tile.tsx` — covered by plan 045;
  do not touch them here.

## Git workflow

- Branch: `advisor/044-memoize-file-browser`
- Commit message style: conventional commits, e.g.
  `perf: memoize derived object lists in the file browser`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Import `useMemo` in file-browser

In `src/components/browser/file-browser.tsx`, change line 3 to include `useMemo`:

```ts
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
```

**Verify**: `pnpm typecheck` → exit 0 (no "useMemo is not defined").

### Step 2: Memoize `folderKeys` and `fileKeys`

Replace the two `.filter(...).map(...)` key derivations with `useMemo` over
`[objects]`:

```ts
  const folderKeys = useMemo(
    () => objects.filter((o) => o.isFolder).map((o) => o.key),
    [objects]
  );
  // ... folderNoteCountsQuery unchanged, still uses { keys: folderKeys } ...

  const fileKeys = useMemo(
    () => objects.filter((o) => !o.isFolder).map((o) => o.key),
    [objects]
  );
  // ... fileShareCountsQuery / fileTagsQuery unchanged, still use { keys: fileKeys } ...
```

Leave the `useNoteCounts` / `useShareLinkCounts` / `useFileTags` calls and the
`folderNoteCounts` / `fileShareCounts` / `fileTags` `?? {}` assignments exactly
as they are.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Memoize `visibleObjects` and `displayedObjects`

Replace the trailing derivations:

```ts
  const visibleObjects = useMemo(
    () =>
      activeTag
        ? objects.filter(
            (o) => o.isFolder || (fileTags[o.key] ?? []).includes(activeTag)
          )
        : objects,
    [objects, activeTag, fileTags]
  );

  const displayedObjects = useMemo(
    () => filterObjectsByName(visibleObjects, nameFilter),
    [visibleObjects, nameFilter]
  );
```

Note: `fileTags` is the resolved `fileTagsQuery.data ?? {}` value. If lint flags
`fileTags` as a missing/extra dependency, follow the lint suggestion — its
identity is stable per query result, which is the desired behavior.

`folderTagValues` (`distinctTagValues(fileTags)`) is cheap and may be left as is,
**or** memoized with `useMemo(() => distinctTagValues(fileTags), [fileTags])` for
consistency. Either is acceptable; prefer memoizing it.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 4: Memoize `selection` in BulkOpsPanel

In `src/components/browser/bulk-ops-panel.tsx`:

1. Ensure `useMemo` is imported from `"react"`. Check the existing React import
   line at the top of the file; if `useMemo` is absent, add it.
2. Replace line 122:

```ts
  const selection: S3Object[] = useMemo(
    () => objects.filter((o) => selectedItems.has(o.key)),
    [objects, selectedItems]
  );
```

`objects` and `selectedItems` are already in scope at that point (they are used
on the same line today). Confirm `selectedItems` is the `Set` referenced there.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 5: Full gate

**Verify**:
- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0
- `pnpm test` → all pass (no behavior change; existing tests must stay green)

## Test plan

This is a pure refactor with **no behavior change** — the same arrays are
produced, just memoized. No new unit tests are required (these are React render
internals; the repo has no render-perf test harness).

- Verification is the existing suite staying green plus a manual smoke if a
  browser is available: open a folder, toggle a tag filter, type in the name
  filter, multi-select files — the list should filter identically to before.
- Existing tests for `name-filter` (`src/lib/browser/name-filter.test.ts`) and
  `tags` must remain green: `pnpm test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0 (including no `react-hooks/exhaustive-deps` warnings on
      the new `useMemo` calls)
- [ ] `pnpm test` exits 0
- [ ] `folderKeys`, `fileKeys`, `visibleObjects`, `displayedObjects` in
      `file-browser.tsx` and `selection` in `bulk-ops-panel.tsx` are each wrapped
      in `useMemo`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- Adding the `useMemo` dependency arrays produces an
  `react-hooks/exhaustive-deps` lint error you cannot resolve by listing the
  genuinely-used dependencies (do NOT silence it with an eslint-disable comment
  without reporting first).
- Any existing test starts failing — that means a behavior change slipped in;
  revert and report.

## Maintenance notes

- If `objects` ever becomes a new array reference on every render upstream (e.g.
  `useObjects` stops using React Query structural sharing), these memos will
  recompute every render again — the fix would move upstream to stabilize
  `objects`, not here.
- Reviewer should confirm the dependency arrays are complete and correct;
  an under-specified dep array (e.g. omitting `activeTag`) would cause a **stale
  filter** bug, which is worse than the perf cost this plan removes.
- Plan 045 memoizes the gallery tiles and stabilizes the callbacks that consume
  `displayedObjects`; the two plans are complementary and touch different files.
