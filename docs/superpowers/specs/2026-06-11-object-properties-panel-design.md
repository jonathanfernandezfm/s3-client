# Object Properties Panel — Design

**Date:** 2026-06-11
**Status:** Approved (decisions delegated to Claude; pending user review)

## Summary

Add a **Properties** tab to the info drawer that shows an object's S3 metadata and lets
ADMIN users edit Content-Type, Cache-Control, custom metadata, and storage class.
SSE status is shown read-only. Properties are object-scoped: a new "Properties" item in
the file row menu opens the drawer focused on that object.

## Goals

- Show Content-Type, Cache-Control, custom (`x-amz-meta-*`) metadata, storage class,
  and SSE status for a single object, plus basic read-only facts (size, ETag, last modified).
- Edit Content-Type, Cache-Control, custom metadata, and storage class in place.
- Respect the existing permission model (role `ADMIN` writes; others read-only).
- Follow existing patterns: `withAuth` API routes, React Query hooks via the key factory,
  Zustand drawer store, activity logging.

## Non-Goals (v1)

- Editing SSE/encryption settings (display only — provider-dependent and risky via copy).
- Editing other content headers (Content-Disposition/Encoding/Language) — preserved on
  save, but not editable.
- Bulk metadata editing across multiple objects.
- Properties for folders/prefixes.
- Objects larger than 5 GB (single-part `CopyObject` limit) — save is disabled with an
  explanatory message.
- Auto-following browser selection (drawer scope follows the explicit menu action only).

## Approaches Considered

1. **New "Properties" tab in the info drawer** (chosen) — matches the feature request
   ("the info-drawer component is the natural home"), reuses the drawer's scope model,
   and sits beside Activity/Notes/Versions which already understand `scope.objectKey`.
2. Standalone dialog (like `version-history-dialog`) — rejected: duplicates drawer
   plumbing and contradicts the stated home.
3. Inline expansion in the file row — rejected: cramped, no room for a metadata editor.

For the edit mechanics:

1. **Server-side head-then-merge** (chosen) — the route does `HeadObject`, merges the
   user's edits over the current values, then `CopyObject` to the same key with
   `MetadataDirective: REPLACE`. Unedited headers (Content-Disposition, Content-Encoding,
   Content-Language, Expires) and the existing SSE configuration are re-applied so a
   partial edit never silently strips them. Single round trip from the client's view.
2. Client-side merge (client sends the full replacement set) — rejected: a stale client
   cache could drop headers another user just set.

## Architecture

```
file-row "Properties" menu item
  → info-drawer-store: setScope({...,objectKey}) + open("properties")
  → PropertiesTab
      → useObjectHead (GET via POST /api/objects/head, queryKeys.objects.detail)
      → useUpdateObjectMetadata (POST /api/objects/metadata)
          → HeadObject → merge → CopyObject (MetadataDirective: REPLACE)
          → recordActivity(METADATA_CHANGE)
          → invalidate objects.list / objects.detail / activity
```

### API routes (new)

**`POST /api/objects/head`** — any member of the connection.
Body: `{ connectionId, bucket, key }`.
Returns `ObjectProperties`:

```ts
{
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;   // read-only context, preserved on save
  contentEncoding?: string;
  contentLanguage?: string;
  metadata: Record<string, string>;  // x-amz-meta-* without the prefix
  storageClass: string;              // HeadObject omits it for STANDARD → default "STANDARD"
  serverSideEncryption?: string;     // e.g. "AES256" | "aws:kms"
  sseKmsKeyId?: string;
  size?: number;
  etag?: string;
  lastModified?: string;
  versionId?: string;
  restore?: string;                  // raw Restore header when present
}
```

**`POST /api/objects/metadata`** — role `ADMIN` only (same 403 pattern as `tag`/`rename`).
Body: `{ connectionId, bucket, key, contentType, cacheControl, metadata, storageClass }`
(all edit fields required from the client; the form always submits the full editable set
it loaded). The route:

1. `HeadObject` to capture current headers and SSE config.
2. Rejects keys ending in `/` and objects > 5 GB (`ContentLength`), and archived objects
   (storage class `GLACIER`/`DEEP_ARCHIVE` not yet restored) with clear error messages.
3. `CopyObject` same bucket/key, `MetadataDirective: REPLACE`, applying the edits and
   re-applying preserved headers + `ServerSideEncryption`/`SSEKMSKeyId` from the head.
   Omits `CacheControl`/`ContentType` params when blank rather than sending empty strings.
4. `recordActivity` with new `ActivityAction.METADATA_CHANGE`.
5. No search-index update (key/size unchanged).

The pure merge logic lives in `src/lib/s3/metadata.ts` as
`buildMetadataCopyParams(head, edits)` so it is unit-testable without S3.

### Database

Prisma migration adding `METADATA_CHANGE` to `enum ActivityAction`. Activity tab renders
unknown-to-it actions generically today; add a label/icon case for it where actions are
mapped.

### Client state & queries

- `InfoDrawerTab` union gains `"properties"`. No other store changes; the existing
  `setScope` already accepts `objectKey`.
- **Scope-clobber fix:** the `file-browser` effect that syncs drawer scope on
  open/navigation currently overwrites scope with `{connectionId, bucket, prefix}`,
  wiping any `objectKey`. Change it to preserve `scope.objectKey` when the connection,
  bucket, and prefix are unchanged; navigation or bucket switch clears object scope.
- New hooks in `src/lib/queries/objects.ts`:
  - `useObjectHead(connectionId, bucket, key)` → `queryKeys.objects.detail(...)`
    (already defined in `keys.ts`, currently unused), enabled only when all args present.
  - `useUpdateObjectMetadata()` mutation; on success invalidates `objects.all` and
    activity (same pattern as existing mutations), plus the specific detail key.

### UI

`src/components/info-drawer/properties-tab.tsx`, registered as a fourth tab
(order: Activity, Notes, Versions, Properties; icon: `SlidersHorizontal`).

- **No `scope.objectKey`:** hint text — "Select a file and choose Properties to view
  its metadata." (mirrors Versions tab empty states).
- **Read-only facts:** size, last modified, ETag, version id (when present), SSE status
  rendered as a badge — `None`, `SSE-S3 (AES256)`, or `SSE-KMS` + truncated key id.
- **Editable form** (when `connection.role === "ADMIN"`, else read-only values):
  - Content-Type: text input with `datalist` of common MIME types.
  - Cache-Control: text input with placeholder example (`public, max-age=31536000`).
  - Custom metadata: key/value row editor (add/remove rows); keys lowercased,
    validated as ASCII token characters; values must be ASCII (S3 constraint).
  - Storage class: select with common classes (STANDARD, STANDARD_IA, ONEZONE_IA,
    INTELLIGENT_TIERING, GLACIER_IR, GLACIER, DEEP_ARCHIVE, REDUCED_REDUNDANCY).
    Non-AWS endpoints may reject some — the save error toast surfaces that.
- Single **Save** button, enabled only when the form is dirty; disabled with explanatory
  text for >5 GB or archived objects. Saving shows a toast on failure (`use-toast`,
  same as Notes tab) and refetches on success.
- When bucket versioning is `Enabled`, show a small note: "Saving rewrites the object
  and creates a new version." (ETag changes either way; that needs no callout.)

**Entry point:** `file-row.tsx` dropdown gains a "Properties" item for files (not
folders), which sets drawer scope with `objectKey` and opens the drawer on the
properties tab. (Tile/gallery views can follow later; the row menu is the v1 entry.)

## Error handling

- Head failures (404 after deletion, permissions) render an inline error state in the tab.
- Save failures keep the form state and show a destructive toast with the S3 error message.
- The route validates required fields → 400, missing connection → 404, non-ADMIN → 403,
  S3 errors → 500 with message (house pattern).

## Testing

- Unit tests (vitest) for `buildMetadataCopyParams`: preserves unedited headers, applies
  edits, strips/normalizes metadata keys, re-applies SSE, omits blank optional headers,
  rejects oversized/archived inputs.
- Manual verification path: MinIO/AWS connection → edit each field → confirm via head
  that values persisted and untouched headers survived.
