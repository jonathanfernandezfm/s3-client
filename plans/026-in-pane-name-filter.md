# Plan 026: Add an in-pane "filter by name" box to the file browser

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat d19fb78..HEAD -- src/components/browser/file-browser.tsx src/components/browser/tag-filter-bar.tsx`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `d19fb78`, 2026-06-22

## Why this matters

To find a specific object in the current folder a user must either eyeball the
list or open the global command palette — and that palette search is **PRO-gated**
(`src/lib/queries/search.ts:64`). The browser already has a *tag* filter but no
*name* filter. A client-side "type to filter the loaded list by name" box is
cheap, ungated, and one of the highest-frequency interactions in any file
manager. This plan adds that box. It operates purely over the already-loaded
objects (no new network calls), so it never changes data-fetching behavior.

## Current state

- `src/components/browser/file-browser.tsx` — the main browser pane. Relevant facts:
  - It already keeps a local UI-filter state for tags and resets it on
    location change (lines 160–164):
    ```tsx
    const [activeTag, setActiveTag] = useState<string | null>(null);

    useEffect(() => {
      setActiveTag(null);
    }, [connectionId, bucket, currentPath]);
    ```
  - It derives `visibleObjects` by applying the tag filter (lines 174–178):
    ```tsx
    const visibleObjects = activeTag
      ? objects.filter(
          (o) => o.isFolder || (fileTags[o.key] ?? []).includes(activeTag)
        )
      : objects;
    ```
  - `visibleObjects` is then passed to both `<FileGallery objects={visibleObjects} …>`
    (line 622–624) and `<FileList objects={visibleObjects} …>` (line 646–648).
  - The `<TagFilterBar …>` renders at lines 600–605, immediately after the
    toolbar `</div>` at line 598 and before the `<div className="relative flex-1 flex flex-col">`
    at line 607. This is where the new filter input goes.
  - `S3Object` (imported at line 47 from `@/types`) has at least `key: string`
    and `isFolder: boolean`. Objects' display name is the final path segment of
    `key` (folders' keys end with `/`).
- `src/components/ui/input.tsx` — the repo's `Input` primitive. Imported
  elsewhere as `import { Input } from "@/components/ui/input"` (see
  `src/components/browser/rename-dialog.tsx:8`).
- `src/lib/utils.ts` exports `cn` (className combiner) used throughout.
- **Convention — pure helper + colocated vitest test.** Filtering/transform
  logic in this repo lives in a small pure function under `src/lib/` with a
  `*.test.ts` beside it. Exemplar: `src/lib/buckets/stats-helpers.ts` +
  `src/lib/buckets/stats-helpers.test.ts`. Match that structure for the
  name-matching logic so it is unit-tested without rendering React.

## Commands you will need

| Purpose   | Command                                    | Expected on success |
|-----------|--------------------------------------------|---------------------|
| Tests     | `pnpm test`                                | all pass            |
| One file  | `pnpm test -- src/lib/browser/name-filter.test.ts` | new tests pass |
| Typecheck | `pnpm exec tsc --noEmit`                   | no **new** errors (see note) |
| Lint      | `pnpm lint`                                | no **new** problems (see note) |

**Baseline note (pre-plan-003):** `main` currently has a known-dirty baseline —
`pnpm exec tsc --noEmit` reports **2 pre-existing errors in
`src/__tests__/landing-page.test.tsx`** and `pnpm lint` reports pre-existing
problems. Before you start, capture the baseline:
`pnpm exec tsc --noEmit 2>&1 | tee /tmp/tsc-before.txt` and
`pnpm lint 2>&1 | tee /tmp/lint-before.txt`. Your gate is **no new** errors
or problems versus those files. Do not attempt to fix the landing-page.test.tsx
errors — they are out of scope (owned by plan 003).

## Scope

**In scope** (the only files you should modify or create):
- `src/lib/browser/name-filter.ts` (create)
- `src/lib/browser/name-filter.test.ts` (create)
- `src/components/browser/file-browser.tsx` (edit: add state, reset, derived
  list, and the input UI)

**Out of scope** (do NOT touch):
- `TagFilterBar` and the tag-filter logic — leave it exactly as is; the name
  filter composes *on top of* `visibleObjects`, it does not replace tags.
- The data-fetching hooks (`useObjects`, pagination/`Load more`) — the filter
  is client-only over already-loaded rows. Do **not** wire it to the server
  search API.
- `FileGallery` / `FileList` internals — they already accept an `objects`
  prop; you only change which array you pass.

## Git workflow

- Branch: `advisor/026-in-pane-name-filter`
- Commit message style: conventional commits, matching `git log` (e.g.
  `feat(browser): add in-pane name filter to the file list`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the pure name-matching helper + test

Create `src/lib/browser/name-filter.ts`:

```ts
/** Display name shown in the browser = final path segment of the key. */
export function objectDisplayName(key: string): string {
  const trimmed = key.endsWith("/") ? key.slice(0, -1) : key;
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

/**
 * Case-insensitive substring filter over an object list by display name.
 * An empty/whitespace query returns the input array unchanged (same reference).
 */
export function filterObjectsByName<T extends { key: string }>(
  objects: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return objects;
  return objects.filter((o) => objectDisplayName(o.key).toLowerCase().includes(q));
}
```

Create `src/lib/browser/name-filter.test.ts`, modeled structurally on
`src/lib/buckets/stats-helpers.test.ts` (use `describe`/`test`/`expect` from
`vitest`). Cover:
- `objectDisplayName`: top-level file key (`"report.pdf"` → `"report.pdf"`),
  nested file key (`"a/b/report.pdf"` → `"report.pdf"`), folder key
  (`"a/photos/"` → `"photos"`), root folder key (`"photos/"` → `"photos"`).
- `filterObjectsByName`: empty query returns the **same array reference**
  (`expect(result).toBe(input)`); whitespace-only query returns input;
  case-insensitive match (`"REP"` matches `"report.pdf"`); substring match in
  the middle of the name; folders matched by their name; non-matching query
  returns `[]`; only the display name is matched, not the full key (a query
  matching a parent folder segment like `"a"` for key `"a/report.pdf"` must
  NOT match because the display name is `"report.pdf"`).

**Verify**: `pnpm test -- src/lib/browser/name-filter.test.ts` → all new tests pass.

### Step 2: Wire local filter state into `file-browser.tsx`

In `src/components/browser/file-browser.tsx`:

1. Add the import near the other `./` and `@/lib` imports (top of file, around
   line 40 where `distinctTagValues` is imported):
   ```tsx
   import { filterObjectsByName } from "@/lib/browser/name-filter";
   import { Input } from "@/components/ui/input";
   import { Search, X } from "lucide-react";
   ```
   (`Search`/`X` come from `lucide-react`; that package is already imported in
   this file at line 34 — add `Search, X` to whichever import you prefer, but
   keep a single `lucide-react` import line if the existing one already lists
   icons. If `X` is already imported, do not duplicate it.)

2. Add filter state next to `activeTag` (after line 160):
   ```tsx
   const [nameFilter, setNameFilter] = useState("");
   ```

3. Extend the location-reset effect (currently lines 162–164) to also clear the
   name filter:
   ```tsx
   useEffect(() => {
     setActiveTag(null);
     setNameFilter("");
   }, [connectionId, bucket, currentPath]);
   ```

4. Apply the name filter on top of `visibleObjects`. Immediately after the
   `visibleObjects` declaration (lines 174–178), add:
   ```tsx
   const displayedObjects = filterObjectsByName(visibleObjects, nameFilter);
   ```

5. Change the two consumers to use `displayedObjects` instead of
   `visibleObjects`: `<FileGallery objects={displayedObjects} …>` (line 623)
   and `<FileList objects={displayedObjects} …>` (line 647). Leave every other
   prop on those components unchanged, including `activeTag` and `onTagClick`.

**Verify**: `pnpm exec tsc --noEmit` → no new errors vs `/tmp/tsc-before.txt`.

### Step 3: Add the filter input UI strip

Insert a filter input directly **above** the `<TagFilterBar …>` block (before
line 600). Match the repo's compact, bordered-strip style used by
`TagFilterBar` (`src/components/browser/tag-filter-bar.tsx:17`):

```tsx
<div className="flex items-center gap-2 px-4 py-2 border-b">
  <Search className="size-3.5 text-muted-foreground shrink-0" />
  <Input
    value={nameFilter}
    onChange={(e) => setNameFilter(e.target.value)}
    placeholder="Filter this folder by name…"
    aria-label="Filter files by name"
    className="h-7 text-xs max-w-xs"
  />
  {nameFilter && (
    <>
      <button
        type="button"
        onClick={() => setNameFilter("")}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        aria-label="Clear name filter"
      >
        <X className="size-3" />
        Clear
      </button>
      <span className="text-xs text-muted-foreground">
        {displayedObjects.length} of {visibleObjects.length}
      </span>
    </>
  )}
</div>
```

**Verify**: `pnpm exec tsc --noEmit` → no new errors; `pnpm lint` → no new
problems vs `/tmp/lint-before.txt`.

### Step 4: Manual smoke (describe in your report, no command)

Confirm by reading the final diff that: (a) the input is rendered above
`TagFilterBar`; (b) `displayedObjects` (not `visibleObjects`) is passed to both
`FileGallery` and `FileList`; (c) the reset effect clears `nameFilter`. You
cannot run the app (no live S3 in this environment) — do not attempt to; the
unit tests plus typecheck are the gate.

## Test plan

- New file `src/lib/browser/name-filter.test.ts` covering the cases listed in
  Step 1, modeled on `src/lib/buckets/stats-helpers.test.ts`.
- No new test is required for the React wiring (the repo does not unit-test the
  browser pane component); the logic that *could* be wrong (name matching) is
  fully covered by the helper test.
- Verification: `pnpm test` → all pass, including the new `name-filter` tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test` exits 0; `src/lib/browser/name-filter.test.ts` exists and passes
- [ ] `pnpm exec tsc --noEmit` shows no errors beyond the 2 pre-existing
      `landing-page.test.tsx` errors recorded in `/tmp/tsc-before.txt`
- [ ] `pnpm lint` shows no new problems vs `/tmp/lint-before.txt`
- [ ] `grep -n "displayedObjects" src/components/browser/file-browser.tsx`
      returns the declaration and both `FileGallery`/`FileList` usages (3+ hits)
- [ ] `git status` shows only the 3 in-scope files changed/created
- [ ] `plans/README.md` status row for 026 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `visibleObjects` excerpt (lines 174–178) or the `activeTag` reset effect
  (lines 162–164) does not match the live code — the file has drifted.
- `FileGallery`/`FileList` no longer accept an `objects` array prop (signature
  changed since this plan was written).
- A verification step fails twice after a reasonable fix attempt.
- You find yourself needing to modify any file outside the in-scope list.

## Maintenance notes

- The filter is **client-only over loaded rows**. When the list is paginated
  ("Load more" at line 670), the filter only sees already-fetched pages — this
  is intentional and matches how the tag filter already behaves. If a future
  change makes filtering need *all* server-side rows, that becomes a server
  search feature (and must respect the PRO gate on `src/lib/queries/search.ts`),
  not an extension of this client filter.
- A reviewer should confirm both `FileGallery` and `FileList` switched to
  `displayedObjects` (a half-applied change would make grid and list views
  disagree) and that `activeTag` filtering still composes correctly (tag filter
  first, then name filter).
- Deferred out of scope: highlighting the matched substring, and a result count
  shown when the filter is empty. Add later only if requested.
