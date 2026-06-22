# Plan 019: Add "Copy key / Copy S3 URI / Copy URL" to the file-browser row menu

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat d19fb78..HEAD -- src/components/browser/file-row.tsx src/components/browser/breadcrumb.tsx`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (UX)
- **Planned at**: commit `d19fb78`, 2026-06-22

## Why this matters

Working with S3 constantly means pasting an object's key, its `s3://bucket/key`
URI, or a download URL into a terminal, a script, a ticket, or a teammate's
chat. Today the app exposes **no** way to copy any of those — `navigator.clipboard`
is wired only for share links (`src/components/shares/share-dialog.tsx:54`,
`src/components/shares/share-list-table.tsx:31`). Users must hand-retype keys or
build an awkward share link just to get a path. This is the single cheapest,
highest-frequency friction point in the object browser. Adding three clipboard
actions to the existing per-row dropdown menu removes it.

## Current state

- `src/components/browser/file-row.tsx` — the file/folder row. It already renders
  a Radix dropdown menu (`DropdownMenu` / `DropdownMenuContent` / `DropdownMenuItem`)
  for per-object actions. The relevant block today (lines ~284–384):

  ```tsx
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" className="h-8 w-8">
        <MoreVertical className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {canPreview && (
        <DropdownMenuItem onClick={onPreview}>
          <Eye className="h-4 w-4" />
          Preview
        </DropdownMenuItem>
      )}
      {/* … Tags, Download, Share, Rename, Properties, Activity, Versions … */}
      {!object.isFolder && (
        <DropdownMenuItem onClick={handleOpenProperties}>
          <SlidersHorizontal className="h-4 w-4" />
          Properties
        </DropdownMenuItem>
      )}
      {/* … */}
    </DropdownMenuContent>
  </DropdownMenu>
  ```

- Each `DropdownMenuItem` follows the pattern `<Icon className="h-4 w-4" /> Label`.
  Icons come from `lucide-react` (imported at the top of the file alongside
  `Eye`, `Download`, `Tag`, `Pencil`, `Link2`, `SlidersHorizontal`, `Trash2`,
  etc.).
- The row already has these props/locals in scope: `object` (an `S3Object` with
  `object.key` and `object.isFolder`), `bucket` (string), and `connectionId`
  (string). Confirm by reading the component's prop destructuring near the top.
- `S3Object.key` is the **full** object key (e.g. `photos/2024/cat.png`), not a
  basename. For a folder, `object.key` ends with `/`.
- **Clipboard convention to match** (`src/components/shares/share-dialog.tsx:53-56`):

  ```tsx
  function copy(text: string) {
    navigator.clipboard.writeText(text);
    // toast feedback follows
  }
  ```

- **Toast convention**: the app uses a `toast({ title, description?, variant? })`
  helper. Find the exact import used elsewhere in `src/components/browser/` —
  e.g. `properties-drawer.tsx` calls `toast({ title: "Properties saved" })`.
  Grep `src/components/browser` and `src/components/properties-drawer` for
  `toast(` and reuse the **same import path** that browser-area components use.
  If browser components import it from a different path than the properties
  drawer, prefer whatever a sibling file in `src/components/browser/` already
  imports.

## Commands you will need

| Purpose   | Command                                  | Expected on success |
|-----------|------------------------------------------|---------------------|
| Install   | `pnpm install`                           | exit 0              |
| Typecheck | `pnpm exec tsc --noEmit`                 | no **new** errors vs. baseline (see note) |
| Lint      | `pnpm lint`                              | no **new** problems vs. baseline |
| Tests     | `pnpm test`                              | all pass            |

> **Baseline note**: at commit `d19fb78` the repo may carry pre-existing `tsc`
> / lint findings unrelated to this change (see `plans/003-clean-verification-baseline.md`).
> Capture the baseline first: run `pnpm exec tsc --noEmit 2>&1 | tee /tmp/tsc-before.txt`
> and `pnpm lint 2>&1 | tee /tmp/lint-before.txt` **before** editing. After
> editing, re-run and diff: your change must introduce **zero new** errors in
> `file-row.tsx` (or `breadcrumb.tsx` if you do Step 3).

## Scope

**In scope**:
- `src/components/browser/file-row.tsx` (edit)
- `src/components/browser/breadcrumb.tsx` (edit — Step 3, optional but recommended)
- `src/lib/s3/uri.ts` (create — tiny pure helper)
- `src/lib/s3/uri.test.ts` (create)

**Out of scope** (do NOT touch):
- Any API route — this is a client-only change; no server work.
- The presign/share-link flow — "Copy URL" here means the **virtual-hosted /
  path-style object URL derived from the connection endpoint**, NOT a presigned
  or share URL. Do not add presigning.
- The bulk-ops panel (`bulk-ops-panel.tsx`) — single-row only in this plan.

## Git workflow

- Branch: `advisor/019-copy-key-and-uri`
- Commit style is conventional commits (see `git log --oneline`: e.g.
  `feat(s3): standardize CopySource construction with a shared helper`). Use
  e.g. `feat(browser): add copy key / s3 uri / url to file row menu`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a pure URI helper + test

Create `src/lib/s3/uri.ts`:

```ts
/** Build the canonical s3:// URI for an object. */
export function s3Uri(bucket: string, key: string): string {
  return `s3://${bucket}/${key}`;
}

/**
 * Build a best-effort HTTP object URL from the connection endpoint.
 * forcePathStyle (MinIO and most S3-compatible) → {endpoint}/{bucket}/{key}.
 * Virtual-hosted (AWS default) → {scheme}://{bucket}.{host}/{key}.
 * Each path segment of the key is encoded; "/" separators are preserved.
 * This is a convenience URL: it is NOT signed and only resolves for
 * publicly-readable objects or buckets configured for anonymous GET.
 */
export function objectHttpUrl(
  endpoint: string,
  bucket: string,
  key: string,
  forcePathStyle: boolean
): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const trimmed = endpoint.replace(/\/+$/, "");
  if (forcePathStyle) {
    return `${trimmed}/${bucket}/${encodedKey}`;
  }
  try {
    const u = new URL(trimmed);
    return `${u.protocol}//${bucket}.${u.host}/${encodedKey}`;
  } catch {
    // endpoint wasn't a parseable URL — fall back to path style.
    return `${trimmed}/${bucket}/${encodedKey}`;
  }
}
```

Create `src/lib/s3/uri.test.ts` (model the structure after the existing
`src/lib/s3/metadata.test.ts` — same `vitest` `describe`/`it`/`expect` style):

```ts
import { describe, it, expect } from "vitest";
import { s3Uri, objectHttpUrl } from "./uri";

describe("s3Uri", () => {
  it("builds an s3:// uri with the full key", () => {
    expect(s3Uri("my-bucket", "a/b/c.png")).toBe("s3://my-bucket/a/b/c.png");
  });
});

describe("objectHttpUrl", () => {
  it("uses path style and strips a trailing slash on the endpoint", () => {
    expect(objectHttpUrl("https://minio.example.com/", "b", "k/x.png", true))
      .toBe("https://minio.example.com/b/k/x.png");
  });
  it("uses virtual-hosted style when forcePathStyle is false", () => {
    expect(objectHttpUrl("https://s3.amazonaws.com", "b", "k/x.png", false))
      .toBe("https://b.s3.amazonaws.com/k/x.png");
  });
  it("encodes special characters per segment but keeps slashes", () => {
    expect(objectHttpUrl("https://h", "b", "a b/c+d.png", true))
      .toBe("https://h/b/a%20b/c%2Bd.png");
  });
});
```

**Verify**: `pnpm test -- uri` → all new tests pass (3+ tests).

### Step 2: Add the three clipboard items to the file-row menu

In `src/components/browser/file-row.tsx`:

1. Import the helpers and a clipboard icon:
   - add `Copy` (and optionally `Link` if you prefer a distinct icon for URL)
     to the existing `lucide-react` import.
   - `import { s3Uri, objectHttpUrl } from "@/lib/s3/uri";`
   - ensure `toast` is imported using the same path a sibling browser component
     already uses (see Current state).
2. The component needs the connection's `endpoint` and `forcePathStyle` to build
   the HTTP URL. Determine how the row can access the active connection:
   - First check whether a `useConnections`/`useConnection` hook exists in
     `src/lib/queries/connections.ts` that returns the connection record
     (including `endpoint` and `forcePathStyle`) for `connectionId`. Grep
     `src/lib/queries/connections.ts` for the exported hooks.
   - If such a hook exists and is already used in browser components, call it
     with `connectionId` and read `connection?.endpoint` / `connection?.forcePathStyle`.
   - **If no client hook exposes the endpoint** (the connection list may strip
     it), then make "Copy URL" **degrade gracefully**: still render "Copy key"
     and "Copy S3 URI" unconditionally, and only render "Copy URL" when an
     endpoint is available. Do NOT invent a new API route to fetch the endpoint
     in this plan — if it's not already client-accessible, omit the URL item and
     note it in your completion report. (Keys + S3 URI are the high-value 90%.)
3. Add a small handler near the other handlers in the component:

   ```tsx
   const copyToClipboard = (text: string, label: string) => {
     navigator.clipboard.writeText(text);
     toast({ title: `${label} copied` });
   };
   ```

4. Insert the items into `<DropdownMenuContent>`, immediately **after** the
   "Properties" item (so clipboard actions sit with the other metadata-ish
   actions). Render them for **both files and folders** (a folder key/URI is
   still useful):

   ```tsx
   <DropdownMenuItem onClick={() => copyToClipboard(object.key, "Key")}>
     <Copy className="h-4 w-4" />
     Copy key
   </DropdownMenuItem>
   <DropdownMenuItem onClick={() => copyToClipboard(s3Uri(bucket, object.key), "S3 URI")}>
     <Copy className="h-4 w-4" />
     Copy S3 URI
   </DropdownMenuItem>
   {/* Render only when endpoint is available (see step 2.2): */}
   {endpoint && (
     <DropdownMenuItem
       onClick={() =>
         copyToClipboard(
           objectHttpUrl(endpoint, bucket, object.key, forcePathStyle ?? true),
           "URL"
         )
       }
     >
       <Link className="h-4 w-4" />
       Copy URL
     </DropdownMenuItem>
   )}
   ```

**Verify**:
- `pnpm exec tsc --noEmit` → no new errors in `file-row.tsx` vs. the baseline.
- `pnpm lint` → no new problems.
- Manual smoke (if a dev server is available): open the row menu, click each
  item, paste — `Copy key` yields the full key, `Copy S3 URI` yields
  `s3://bucket/key`, `Copy URL` yields an http(s) URL.

### Step 3 (recommended): Add "Copy path" to the breadcrumb

In `src/components/browser/breadcrumb.tsx`, add a small "copy current path"
affordance (a button or menu item) that copies the current prefix as
`s3://{bucket}/{currentPath}` using `s3Uri`. The breadcrumb already knows the
bucket and current path. Reuse the same `copyToClipboard` pattern and `toast`.
If wiring this cleanly requires structural changes beyond a single button, skip
it and note that in your report — Steps 1–2 are the core deliverable.

**Verify**: `pnpm exec tsc --noEmit` and `pnpm lint` → no new findings.

## Test plan

- New unit tests in `src/lib/s3/uri.test.ts` (created in Step 1): s3 URI format,
  path-style URL, virtual-hosted URL, per-segment encoding. Model after
  `src/lib/s3/metadata.test.ts`.
- No component test is required (the existing suite has few component tests for
  browser rows). The clipboard handlers are thin wrappers over the tested pure
  helpers.
- Verification: `pnpm test` → all pass, including the new `uri` tests.

## Done criteria

ALL must hold:

- [ ] `src/lib/s3/uri.ts` and `src/lib/s3/uri.test.ts` exist; `pnpm test -- uri` passes.
- [ ] `pnpm test` exits 0 (full suite still green).
- [ ] `pnpm exec tsc --noEmit` introduces no new errors vs. the pre-edit baseline.
- [ ] `pnpm lint` introduces no new problems vs. the pre-edit baseline.
- [ ] The file-row dropdown shows "Copy key" and "Copy S3 URI" for files and
      folders; "Copy URL" appears when the endpoint is client-accessible.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The `DropdownMenu` block in `file-row.tsx` no longer matches the "Current
  state" excerpt (the menu was refactored since this plan was written).
- The connection endpoint is **not** available to client components AND adding
  it would require a new/changed API route — in that case ship Steps 1–2
  without "Copy URL" and report the omission; do not build a route.
- `pnpm test` shows failures unrelated to your change on a clean checkout
  (pre-existing breakage — report it; it's `plans/003`'s job, not this one).

## Maintenance notes

- If a presigned/public "Copy share URL" is later added, keep it distinct from
  "Copy URL" (unsigned endpoint URL) — they serve different needs.
- `objectHttpUrl` is best-effort and unsigned; if users report "Copy URL gives a
  link that 403s," that's expected for private objects — consider a tooltip
  clarifying it's unsigned, or route them to Share.
- Reviewer: confirm the key is copied **unencoded** (raw `object.key`) while the
  HTTP URL is **encoded** — these are deliberately different.
