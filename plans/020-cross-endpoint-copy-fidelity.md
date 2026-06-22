# Plan 020: Preserve metadata, tags & storage class on cross-endpoint copy/move

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat d19fb78..HEAD -- src/app/api/objects/copy/route.ts src/app/api/objects/move/route.ts src/lib/s3`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug (data fidelity)
- **Planned at**: commit `d19fb78`, 2026-06-22

## Why this matters

The app's headline feature is connecting to **multiple** S3 endpoints and moving
data between them. But the **cross-endpoint** copy/move path silently discards
almost everything except the bytes: it carries only `ContentType`. User-defined
metadata (`x-amz-meta-*`), object tags, `Cache-Control`, `Content-Disposition`,
`Content-Encoding`, `Content-Language`, and the storage class are all **lost**
when an object is copied/moved between two different endpoints. A user moving a
curated dataset from MinIO to AWS (or between two AWS accounts/regions exposed as
separate connections) gets stripped objects with no warning. For a move, the
source is then deleted — so the original metadata/tags are gone for good.

> **Why this is scoped to cross-endpoint only**: the **same-endpoint** path uses
> `CopyObjectCommand` *without* specifying `MetadataDirective`/`TaggingDirective`,
> which means AWS defaults to `COPY` — so same-endpoint copy/move/rename already
> preserves metadata and tags correctly. Do **not** change the same-endpoint
> branch. Verify this assumption holds (it's why the bug is narrow) before
> editing; if the same-endpoint branch is also dropping data, STOP and report —
> the fix is different.

## Current state

Two routes share an identical cross-endpoint helper shape.

- `src/app/api/objects/copy/route.ts` — `copySingleObject` (lines 175–231) and
  `copyFolder` (lines 233–313). The cross-endpoint branch (the `else` of
  `isSameEndpoint`) today does (lines 197–219):

  ```ts
  // Stream download and upload for cross-endpoint
  const getCommand = new GetObjectCommand({ Bucket: sourceBucket, Key: sourceKey });
  const response = await sourceClient.send(getCommand);
  if (!response.Body) {
    throw new Error("Empty response body");
  }
  const upload = new Upload({
    client: targetClient,
    params: {
      Bucket: targetBucket,
      Key: targetKey,
      Body: response.Body,
      ContentType: response.ContentType,   // ← only ContentType carried
    },
  });
  await upload.done();
  ```

- `src/app/api/objects/move/route.ts` — `moveSingleObject` (lines 223–279) and
  `moveFolder` (lines 281–363). The cross-endpoint branch is byte-for-byte the
  same shape as copy's (lines 245–268 for single, 325–343 for folder).

- A `GetObjectCommand` **response** already includes most of what we need:
  `response.Metadata` (the `x-amz-meta-*` map), `response.ContentType`,
  `response.CacheControl`, `response.ContentDisposition`, `response.ContentEncoding`,
  `response.ContentLanguage`, `response.Expires`. It does **not** reliably include
  the tag **set** (only `TagCount`), and `StorageClass` on a GetObject response is
  often absent. So tags require a separate `GetObjectTaggingCommand` against the
  source.

- The existing tag route shows the tagging command usage
  (`src/app/api/objects/tag/route.ts:97-105`):

  ```ts
  const result = await client.send(new GetObjectTaggingCommand({ Bucket, Key }));
  const tags = (result.TagSet ?? []).map((t) => ({ key: t.Key ?? "", value: t.Value ?? "" }));
  ```

- `@aws-sdk/lib-storage`'s `Upload` accepts the same params as `PutObject`,
  including `Metadata`, `CacheControl`, `ContentDisposition`, `ContentEncoding`,
  `ContentLanguage`, `StorageClass`, and `Tagging` (a URL-encoded
  `key1=val1&key2=val2` string). `Upload` performs multipart automatically for
  large bodies, so no separate large-object handling is needed here.

- Repo conventions: routes use `withAuth`, return `NextResponse.json`, and the
  copy/move helpers already collect per-item `{ sourceKey, targetKey, success,
  error }` results and swallow per-item errors into the result array. Match that —
  metadata/tag fetch failures for one object must **not** abort the whole batch.

## Commands you will need

| Purpose   | Command                          | Expected on success |
|-----------|----------------------------------|---------------------|
| Install   | `pnpm install`                   | exit 0              |
| Typecheck | `pnpm exec tsc --noEmit`         | no new errors vs. baseline |
| Tests     | `pnpm test`                      | all pass, incl. new tests |
| Lint      | `pnpm lint`                      | no new problems vs. baseline |

> Capture the pre-edit `tsc`/`lint` baseline as in plan 019's "Baseline note"
> before editing; your change must add **zero new** findings.

## Scope

**In scope**:
- `src/lib/s3/copy-fidelity.ts` (create — shared helper, unit-tested)
- `src/lib/s3/copy-fidelity.test.ts` (create)
- `src/app/api/objects/copy/route.ts` (edit cross-endpoint branches only)
- `src/app/api/objects/move/route.ts` (edit cross-endpoint branches only)

**Out of scope** (do NOT touch):
- The `isSameEndpoint` (`CopyObjectCommand`) branches — they already preserve
  fidelity via AWS default directives. Leave them exactly as-is.
- `src/app/api/objects/rename/route.ts` — rename is same-endpoint only; no
  cross-endpoint path exists there.
- Versioned copy (`src/app/api/objects/versions/copy/route.ts`) — out of scope.
- Atomicity / transactional move — explicitly rejected in `plans/README.md`
  ("S3 + DB transactional safety…"). This plan is about *fidelity*, not
  atomicity. Do not add rollback logic.

## Git workflow

- Branch: `advisor/020-cross-endpoint-copy-fidelity`
- Conventional commits, e.g. `fix(s3): preserve metadata/tags/storage-class on cross-endpoint transfer`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Write a pure helper that builds Upload params from a source object

Create `src/lib/s3/copy-fidelity.ts`. It takes the fields read from the source
(GetObject response + the tag set) and returns the extra params to merge into the
`Upload` `params`. Keeping it pure makes it unit-testable without a live S3.

```ts
import type { GetObjectCommandOutput } from "@aws-sdk/client-s3";

export interface SourceTag {
  key: string;
  value: string;
}

export interface FidelityParams {
  ContentType?: string;
  CacheControl?: string;
  ContentDisposition?: string;
  ContentEncoding?: string;
  ContentLanguage?: string;
  Metadata?: Record<string, string>;
  StorageClass?: string;
  Tagging?: string;
}

/** Encode a tag set as the `Tagging` query-string PutObject expects. */
export function encodeTagging(tags: SourceTag[]): string | undefined {
  if (!tags.length) return undefined;
  return tags
    .map((t) => `${encodeURIComponent(t.key)}=${encodeURIComponent(t.value)}`)
    .join("&");
}

/**
 * Build the system-header + metadata + tag params to carry from a source object
 * onto a cross-endpoint Upload. Only defined fields are included so we never
 * overwrite a header with `undefined`. `storageClass` is passed separately
 * because GetObject responses often omit it (read it from HeadObject upstream
 * if you want it; pass undefined to skip).
 */
export function buildFidelityParams(
  head: Pick<
    GetObjectCommandOutput,
    | "ContentType"
    | "CacheControl"
    | "ContentDisposition"
    | "ContentEncoding"
    | "ContentLanguage"
    | "Metadata"
  >,
  tags: SourceTag[],
  storageClass?: string
): FidelityParams {
  const out: FidelityParams = {};
  if (head.ContentType) out.ContentType = head.ContentType;
  if (head.CacheControl) out.CacheControl = head.CacheControl;
  if (head.ContentDisposition) out.ContentDisposition = head.ContentDisposition;
  if (head.ContentEncoding) out.ContentEncoding = head.ContentEncoding;
  if (head.ContentLanguage) out.ContentLanguage = head.ContentLanguage;
  if (head.Metadata && Object.keys(head.Metadata).length > 0) {
    out.Metadata = head.Metadata;
  }
  if (storageClass && storageClass !== "STANDARD") out.StorageClass = storageClass;
  const tagging = encodeTagging(tags);
  if (tagging) out.Tagging = tagging;
  return out;
}
```

Create `src/lib/s3/copy-fidelity.test.ts` (vitest, model after
`src/lib/s3/metadata.test.ts`):

- `encodeTagging([])` → `undefined`.
- `encodeTagging([{key:"a",value:"b c"}, {key:"x",value:"y"}])` →
  `"a=b%20c&x=y"`.
- `buildFidelityParams({ContentType:"image/png", Metadata:{}}, [])` → `{ ContentType: "image/png" }`
  (empty metadata omitted, no Tagging).
- `buildFidelityParams({Metadata:{owner:"jo"}}, [{key:"env",value:"prod"}], "GLACIER")`
  → includes `Metadata:{owner:"jo"}`, `Tagging:"env=prod"`, `StorageClass:"GLACIER"`.
- `buildFidelityParams({}, [], "STANDARD")` → `{}` (STANDARD is the default; omit it).

**Verify**: `pnpm test -- copy-fidelity` → all new tests pass.

### Step 2: Use the helper in copy's cross-endpoint single-object branch

In `src/app/api/objects/copy/route.ts`:

1. Add imports: `GetObjectTaggingCommand` to the existing `@aws-sdk/client-s3`
   import, and `import { buildFidelityParams, type SourceTag } from "@/lib/s3/copy-fidelity";`.
2. In `copySingleObject`'s `else` (cross-endpoint) branch, after the
   `GetObjectCommand` send and the `response.Body` check, fetch the source tag
   set (best-effort) and merge fidelity params into the `Upload`:

   ```ts
   let tags: SourceTag[] = [];
   try {
     const tagging = await sourceClient.send(
       new GetObjectTaggingCommand({ Bucket: sourceBucket, Key: sourceKey })
     );
     tags = (tagging.TagSet ?? []).map((t) => ({ key: t.Key ?? "", value: t.Value ?? "" }));
   } catch {
     // Source may not grant s3:GetObjectTagging; proceed without tags.
   }
   const fidelity = buildFidelityParams(response, tags);
   const upload = new Upload({
     client: targetClient,
     params: {
       Bucket: targetBucket,
       Key: targetKey,
       Body: response.Body,
       ...fidelity,
     },
   });
   await upload.done();
   ```

   Note: `StorageClass` is left out here (GetObject omits it). Carrying storage
   class cross-endpoint is **optional** for this plan — if you want it, do a
   `HeadObjectCommand` on the source first and pass `head.StorageClass` as the
   third arg to `buildFidelityParams`. If you skip it, say so in your report;
   metadata + tags are the primary fix.

**Verify**: `pnpm exec tsc --noEmit` → no new errors.

### Step 3: Apply the same change to copy's folder branch

In `copyFolder`'s cross-endpoint branch (around lines 277–294), apply the
identical pattern: best-effort `GetObjectTaggingCommand` on `obj.Key`, then merge
`buildFidelityParams(response, tags)` into the `Upload` params. Keep the existing
per-item try/catch so one object's tag-fetch failure doesn't abort the folder.

**Verify**: `pnpm exec tsc --noEmit` → no new errors.

### Step 4: Apply the same changes to move's two cross-endpoint branches

In `src/app/api/objects/move/route.ts`, repeat Steps 2–3 for `moveSingleObject`
(lines 245–268) and `moveFolder` (lines 325–343). Add the same imports. The
source delete (lines 128–141) happens **after** all copies succeed and is
unchanged — do not touch it.

**Verify**: `pnpm exec tsc --noEmit` → no new errors; `pnpm lint` → no new problems.

### Step 5: Full verification

Run `pnpm test && pnpm exec tsc --noEmit && pnpm lint`. New `copy-fidelity` tests
pass; no new type/lint findings vs. baseline.

## Test plan

- **Unit** (`src/lib/s3/copy-fidelity.test.ts`, created Step 1): the cases listed
  in Step 1. These are the only cases practically testable without a live S3 — the
  route handlers talk to real S3 clients, and the repo has **no** S3 mocking
  harness today (confirm: grep `src/app/api/objects` test files — there are none).
- **Do not** add route-level tests that require a live endpoint or an S3 mock
  framework; that's a larger effort tracked separately (`plans/007` adds the route
  test harness). Note in your report that route-level coverage is deferred to 007.
- Verification: `pnpm test` → all pass including new unit tests.

## Done criteria

ALL must hold:

- [ ] `src/lib/s3/copy-fidelity.ts` + `.test.ts` exist; `pnpm test -- copy-fidelity` passes.
- [ ] Both cross-endpoint branches in `copy/route.ts` and both in `move/route.ts`
      build `Upload` params via `buildFidelityParams` and fetch source tags
      best-effort.
- [ ] The `isSameEndpoint` branches in both routes are **unchanged**
      (`git diff` shows no edits inside the `if (isSameEndpoint)` blocks).
- [ ] `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint` add no new findings vs. baseline.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The same-endpoint branch turns out to also be dropping metadata/tags (the
  "Current state" assumption is wrong) — the correct fix is then different
  (explicit `MetadataDirective`/`TaggingDirective: "COPY"`), and you should
  re-plan rather than guess.
- The cross-endpoint helper structure in either route no longer matches the
  excerpts (routes refactored since `d19fb78`).
- You find that `Upload` rejects the `Tagging` string against the target endpoint
  (some S3-compatible servers reject tagging on PutObject) — if so, fall back to
  a post-upload `PutObjectTaggingCommand` and report the change.

## Maintenance notes

- If versioned cross-endpoint copy is ever implemented
  (`versions/copy/route.ts`), it should reuse `buildFidelityParams`.
- `Content-Disposition`/`Content-Encoding`/`Content-Language` are now carried but
  still not *editable* in the UI (properties drawer only edits content-type,
  cache-control, storage class) — that's a separate, low-value follow-up.
- Reviewer: confirm the per-item try/catch around the tag fetch — a source that
  denies `s3:GetObjectTagging` must degrade to "no tags," not fail the transfer.
- The pre-existing partial-failure-on-move robustness nit (copy ok, delete fails →
  orphan) is **out of scope** and already noted in `plans/018`'s maintenance notes.
