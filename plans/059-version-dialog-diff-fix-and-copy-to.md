# Plan 059: Version history — fix diff-view fetch lifecycle + wire up "Copy to…"

> Drift check (run first): `git diff --stat e9ad3b3..HEAD -- src/components/versions/version-history-dialog.tsx` — if changed, compare excerpts below to live code; on mismatch STOP.

## Status
- Priority: P1 | Effort: M | Risk: LOW-MED | Depends on: none | Category: bug + feature
- Planned at: commit e9ad3b3, 2026-06-27

## Why this matters
Two problems in `src/components/versions/version-history-dialog.tsx`, live in production:
1. **`DiffView` misuses `useMemo` to run side-effecting `fetch` calls** with no cleanup, no abort, and no `response.ok` check. Rapidly switching versions can leave the diff stuck on "Loading diff…" (stale state overwrite) or render an S3 error body (e.g. 403 from an expired presigned URL) as if it were file content.
2. **The "Copy to…" button is permanently `disabled` with no handler** — a dead, half-finished control. The backend route (`/api/objects/versions/copy`) and the React Query hook (`useCopyVersion`, `src/lib/queries/versions.ts:118`) already exist; only the UI is unwired. Wiring it delivers a real feature for free.

## Current state (verbatim)
`src/components/versions/version-history-dialog.tsx`:
- DiffView (lines 251-292):
```tsx
const aUrl = useVersionPresignUrl({ connectionId, bucket, key: a.key, versionId: a.versionId });
const bUrl = useVersionPresignUrl({ connectionId, bucket, key: b.key, versionId: b.versionId });
const [aText, setAText] = useState<string | null>(null);
const [bText, setBText] = useState<string | null>(null);

useMemo(() => {
  if (aUrl.data?.url) fetch(aUrl.data.url).then((r) => r.text()).then(setAText);
  if (bUrl.data?.url) fetch(bUrl.data.url).then((r) => r.text()).then(setBText);
}, [aUrl.data?.url, bUrl.data?.url]);

if (aText === null || bText === null) {
  return <div className="p-6 text-sm">Loading diff…</div>;
}
```
- ActionBar "Copy to…" button (lines 385-388):
```tsx
<Button size="sm" variant="ghost" disabled>
  <CopyIcon className="h-3 w-3 mr-1" />
  Copy to…
</Button>
```
- `ActionBar` already has in scope: `connectionId`, `bucket`, `version` (an `S3ObjectVersion` with `.key`, `.versionId`, `.isLatest`, `.isDeleteMarker`), `onClose`, and `addNotification = useNotificationStore((s) => s.addNotification)`.

Existing infra to reuse (DO read these to confirm signatures before using):
- `src/lib/queries/versions.ts:118` — `useCopyVersion()` mutation. Its variables: `{ connectionId, bucket, key, versionId, targetConnectionId, targetBucket, targetKey }`. Returns `{ success: true }`. Note the backend route returns 400 "Cross-connection version copy is not supported in v1" if `connectionId !== targetConnectionId`.
- `src/components/browser/destination-picker-dialog.tsx` — exports `DestinationPickerDialog` and `Destination` type. Props: `{ open, mode: "copy"|"move", count, defaultConnectionId, defaultBucket, onCancel, onConfirm: (dest: Destination) => void }`. `Destination = { connectionId, bucket, path }` where `path` is "" or a prefix ending in "/".
- Notification shape (used elsewhere in this same file): `addNotification({ type: "info"|"error", title: string, status: "completed"|"error", error?: string })`.

## Scope
In scope (modify ONLY): `src/components/versions/version-history-dialog.tsx` (+ plan/index/changelog files).
Out of scope: `destination-picker-dialog.tsx` (import and reuse as-is — do NOT modify), `src/lib/queries/versions.ts` (the hook already exists — do NOT modify), the backend route, any other file.

## Steps
### Step 1: Fix DiffView fetch lifecycle
Replace the `useMemo` side-effect with a `useEffect` keyed on `[aUrl.data?.url, bUrl.data?.url]` that:
- Uses an `AbortController` (one per effect run) passed to both `fetch` calls; abort it in the effect cleanup.
- For each fetch, checks `if (!res.ok) throw` and on error sets the corresponding text state to a short placeholder like `"(failed to load this version)"` (NOT the error body) so the diff still renders and never hangs.
- Guards against setting state after abort (ignore `AbortError`).
- Resets `aText`/`bText` to `null` at the start of the effect so switching versions shows "Loading diff…" again rather than stale content.
Keep the existing `if (aText === null || bText === null) return <Loading/>` gate and the `diffLines` render below unchanged.

Add `import { useEffect } from "react";` if `useEffect` is not already imported (check the top of the file; `useState`/`useMemo` are imported — adjust the import line, and remove `useMemo` from the import only if it is no longer used anywhere in the file).

### Step 2: Wire up "Copy to…"
In `ActionBar`:
- Add `const copyVersion = useCopyVersion();` (import it from `@/lib/queries/versions`).
- Add `const [showCopyTo, setShowCopyTo] = useState(false);`.
- Change the disabled button to: `onClick={() => setShowCopyTo(true)}`, remove `disabled`, and keep it disabled only while `copyVersion.isPending`.
- Render `<DestinationPickerDialog open={showCopyTo} mode="copy" count={1} defaultConnectionId={connectionId} defaultBucket={bucket} onCancel={() => setShowCopyTo(false)} onConfirm={(dest) => { ... }} />` (import from `@/components/browser/destination-picker-dialog`).
- In `onConfirm`, compute the target key: `const filename = version.key.split("/").pop() || version.key; const targetKey = dest.path + filename;` then call:
```tsx
copyVersion.mutate(
  { connectionId, bucket, key: version.key, versionId: version.versionId,
    targetConnectionId: dest.connectionId, targetBucket: dest.bucket, targetKey },
  {
    onSuccess: () => { addNotification({ type: "info", title: `Copied version to ${targetKey}.`, status: "completed" }); setShowCopyTo(false); },
    onError: (e) => addNotification({ type: "error", title: "Copy failed", error: (e as Error).message, status: "error" }),
  },
);
```
This means if the user picks a different connection, the backend's v1 guard returns a clear error surfaced as a notification — acceptable for v1.

**Verify**: `pnpm typecheck` exit 0; `pnpm lint` exit 0; `pnpm test` pass. `git grep -n "disabled>" src/components/versions/version-history-dialog.tsx` no longer matches the Copy-to button. `git grep -n "useMemo" src/components/versions/version-history-dialog.tsx` returns nothing for the DiffView fetch (it's now useEffect).

## Test plan
No existing test file for this dialog was found; do NOT invent brittle DOM tests. The verification gate (`pnpm test` continues to pass, typecheck/lint clean) plus the grep checks above are the done criteria. If a test file `src/components/versions/version-history-dialog.test.tsx` already exists, run it and keep it green.

## Done criteria (ALL)
- [ ] DiffView uses `useEffect` + `AbortController` + `res.ok` check; resets text on version change
- [ ] "Copy to…" button opens the destination picker and copies via `useCopyVersion`
- [ ] `pnpm typecheck` exit 0, `pnpm lint` exit 0, `pnpm test` pass
- [ ] Only `version-history-dialog.tsx` (+ plan/index/changelog) changed
- [ ] PR opened

## STOP conditions
- Live code at the cited lines doesn't match excerpts (drift) → STOP.
- `useCopyVersion` or `DestinationPickerDialog` signatures differ from those documented above → STOP and report (do not guess).
- A verification fails twice after a reasonable fix → STOP.

## Maintenance notes
Cross-connection version copy is intentionally unsupported in v1 (backend guard). If that lands later, the destination picker already allows choosing another connection, so only the backend changes. Reviewer: confirm the AbortController cleanup actually aborts and that error states render a placeholder, not raw error text.
