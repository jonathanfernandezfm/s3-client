# Bookmarks — Pinned buckets, folders, and prefixes

**Date:** 2026-06-03
**Scope:** New `Bookmark` Prisma model, three API routes, one query module, edits to sidebar, file browser, file row, file tile, bucket card, and command palette.

## Problem

Users routinely return to the same locations: a bucket they live in (`media-prod`), a deep prefix where work happens (`processed/2024/Q4/`), an inbox-style folder (`incoming/triage/`). Today the only persistent shortcut is the `recent-locations-store` (client-side, last 10 visits, surfaced only in the command palette). Recents are passive — driven by where you've been, not where you mean to go — and capped, so frequently-visited paths get evicted by transient ones.

There is no deliberate, persistent, user-controlled shortcut. We add one.

## Decision

A single unified `Bookmark` model, server-side, per-user, scoped through the connection it points at. Two pin targets share one record shape:

- **Bucket pin** (`prefix === null`) — surfaces in the sidebar and the command palette.
- **Folder/prefix pin** (`prefix !== null`) — surfaces in a pill strip above the breadcrumb inside the bucket, and in the command palette.

Files are not pinnable. Custom labels and drag-to-reorder are deferred.

Recents stay exactly as they are today — client-side, ephemeral, capped at 10. They complement bookmarks; they don't compete with them.

## Data model

```prisma
model Bookmark {
  id            String   @id @default(uuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  connectionId  String
  connection    Connection @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  bucket        String
  prefix        String?
  label         String?
  createdAt     DateTime @default(now())

  @@unique([userId, connectionId, bucket, prefix])
  @@index([userId, connectionId])
  @@index([userId, connectionId, bucket])
  @@map("bookmarks")
}
```

Add the inverse relation on `User` (`bookmarks Bookmark[]`) and on `Connection` (`bookmarks Bookmark[]`).

**Why this shape:**

- `prefix` is the discriminator. `NULL` → bucket pin; non-null → folder pin. Folder `prefix` values are stored **with the trailing slash** (e.g. `processed/2024/Q4/`), matching the S3 object key convention used elsewhere in the codebase (see `file-row.tsx`, `file-browser.tsx`'s `currentPath` construction). This makes `bookmark.prefix === object.key` a direct equality check with no normalization. No polymorphic table, no enum.
- Workspace ownership is *derivable* through the connection. Not stored. Allows future addition of `workspaceId` + `scope: 'user' | 'workspace'` without a destructive migration.
- `label` exists in the schema now (cheap), but no UI writes to it in v1. Adding rename later won't require a migration.
- Cascade through `userId` and `connectionId` handles "user deleted" and "connection deleted" without any application code.
- The unique constraint makes "is this pinned?" a single indexed lookup and prevents accidental double-pins.

## API surface

All routes wrapped in `withAuth` like every other route in `src/app/api/`. Bookmarks returned from `GET` are sorted by `createdAt DESC` so every surface (sidebar, palette, bucket strip) shows newest pins first without needing its own sort.

### `GET /api/bookmarks`

List the current user's bookmarks. Returns a flat array, each item joined with the connection's display name so callers don't need a second lookup.

Optional query params:

- `?connectionId=<id>` — restrict to one connection
- `?bucket=<name>` — restrict to one bucket (requires `connectionId`)

Server-side, each bookmark is filtered through `getConnectionAccessById(connectionId, userId)`. Bookmarks pointing at connections the user no longer has access to are silently omitted (the row stays in DB; access can be restored).

Response shape:

```ts
type BookmarkResponse = {
  id: string;
  connectionId: string;
  connectionName: string;
  bucket: string;
  prefix: string | null;
  label: string | null;
  createdAt: string;
};
```

### `POST /api/bookmarks`

Create a bookmark. Body: `{ connectionId, bucket, prefix? }`. Authorizes by checking `getConnectionAccessById`.

Returns the new bookmark in the same shape as `GET`. On unique-constraint violation (already pinned), returns the existing row with `200` — pin intent is idempotent.

### `DELETE /api/bookmarks/[id]`

Delete a bookmark. Validates `userId` matches the requester before deleting. Returns `{ success: true }`.

No `PUT` / `PATCH` in v1 — nothing to edit yet.

## Client query layer

New file: `src/lib/queries/bookmarks.ts`.

Hooks:

```ts
useBookmarks()                                       // all of user's bookmarks
useBookmarksForBucket(connectionId, bucket)          // filtered from same cache via useMemo
useCreateBookmark()
useDeleteBookmark()
```

Single network fetch backs every surface (sidebar, palette, bucket strip, row stars). Filtering is in-hook, not over the network. Mutations invalidate `bookmarkKeys.all` so all surfaces refresh together.

Add `bookmarkKeys` to `src/lib/queries/keys.ts` following the existing factory pattern.

**Recents store** (`src/lib/stores/recent-locations-store.ts`) is unchanged.

## UI surfaces

### 1. Folder row star + dropdown (`src/components/browser/file-row.tsx`)

For folder rows only:

- A `Star` icon (filled when pinned, hollow when not) in the actions cell, immediately to the left of the existing 3-dots `MoreVertical` trigger. Click toggles via `useCreateBookmark` / `useDeleteBookmark`.
- A new `DropdownMenuItem` "Pin folder" / "Unpin folder" inside the existing dropdown, above "Delete".

File rows (`!object.isFolder`) get no star and no pin item.

Pin-state lookup: each row asks `useBookmarksForBucket(connectionId, bucket)` if `object.key` is pinned. The hook reads from the React Query cache, so this is not N network calls.

### 2. Folder tile star (`src/components/browser/file-tile.tsx`)

Grid view parity. Star overlay on folder tiles (top-right corner). Same toggle behavior as the row star.

### 3. Bucket card star (`src/components/buckets/bucket-card.tsx`)

Star icon in the bucket card header. Pins a bucket-level bookmark (`prefix === null`).

### 4. Sidebar "Pinned" section (`src/components/shared/app-sidebar.tsx`)

New section rendered between Connections and Workspaces, *only when* `useBookmarks()` returns at least one bucket-level pin.

Layout:

- Small uppercase label `Pinned` matching the existing "Workspaces" label style (`text-[10px] uppercase tracking-wider text-muted-foreground px-3 pb-1`).
- One row per bucket-level pin. Each row shows the bucket name as the primary line and the connection name as a smaller, muted subtitle below (Q7 option B). Star icon to the left.
- Clicking a row updates the focused pane's active tab via `updateTabBucket(paneId, tabId, connectionId, connectionName, bucket)` — same code path the command palette already uses.
- The existing `pushRecent` call fires on click, so visiting a pinned bucket also bumps it into recents.

### 5. Bucket-level pinned pill strip (`src/components/browser/file-browser.tsx`)

Rendered *above* the existing `<Breadcrumb>` block, only when `useBookmarksForBucket()` returns at least one prefix pin.

Layout:

- Small `★ Pinned` label, then a horizontal pill row.
- Each chip shows the *path tail* as the label — the last non-empty segment, computed as `prefix.split("/").filter(Boolean).at(-1)` (e.g. `processed/2024/Q4/` → `Q4`). The full path goes in the chip's `title` attribute for hover disambiguation.
- Wraps to a second line if there are too many to fit.
- Clicking a chip calls the existing `onNavigate(prefix)` — same path as breadcrumb clicks. No new routing logic.

### 6. Command palette "Pinned" group (`src/components/command-palette/command-palette.tsx`, `use-palette-items.ts`)

- Extend `PaletteItems` with a `pinned: PinnedItem[]` field.
- Populate from `useBookmarks()`, joined with connections data already in the hook.
- Render a new `CommandGroup heading="Pinned"` *above* "Recent" — intentional shortcuts outrank passive history.
- Bucket pins reuse `navigateToBucket`; prefix pins reuse `navigateToRecent` (the recent-navigation handler already updates tab bucket + path correctly).

## Edge cases

| Scenario | Behavior |
|---|---|
| Connection deleted | Prisma cascade deletes the bookmark rows. No app code. |
| User loses access to a connection | `GET /api/bookmarks` silently omits inaccessible bookmarks (row stays in DB; re-surfaces if access is restored). |
| Bucket or folder deleted externally | Silently hidden by the bucket-scoped strip / row star (nothing to highlight against). Row stays in DB. If the path reappears, the pin re-surfaces. No "missing" UI. |
| User pins the same path twice | `@@unique` rejects with 409; client treats `POST + 409` as success and re-reads from cache. |
| User unpins from any surface | All entry points call the same `useDeleteBookmark()`. Sidebar, palette, strip, and row star all update from the invalidation. |
| `VIEWER` role on the connection | Pin/unpin works freely. Pinning is a personal-preference action, not an S3 write. Matches existing recents behavior for viewers. |
| Personal workspace deleted (user removed from team workspace) | Connection cascade removes bookmarks for that connection. Other workspaces' bookmarks are untouched. |

## Out of scope (v1)

- Custom pin labels (column exists; no UI sets it).
- Drag-to-reorder pins (newest-first only, derived from `createdAt DESC`).
- Pinning individual files.
- Sharing pins across team members (per-user only; schema leaves room to add later).
- "Missing pin" indicator when the target is gone (silent hide chosen).
- Counts or badges on pins (e.g. "new objects since pinned").
- Pin-from-breadcrumb button.
- Right-click context menus anywhere in the app.

## Implementation order

1. Prisma model + migration; add `User.bookmarks` and `Connection.bookmarks` inverse relations.
2. `src/lib/db/bookmarks.ts` — the data access layer (find, create, delete, with access check).
3. API routes under `src/app/api/bookmarks/`.
4. `src/lib/queries/bookmarks.ts` and `bookmarkKeys` in `src/lib/queries/keys.ts`.
5. Star affordance on `file-row.tsx`, `file-tile.tsx`, and `bucket-card.tsx`; dropdown item on `file-row.tsx`.
6. Sidebar pinned section in `app-sidebar.tsx`.
7. Bucket-level pill strip in `file-browser.tsx`.
8. Command palette `Pinned` group in `use-palette-items.ts` and `command-palette.tsx`.

Each step is testable in isolation; the visible UI starts appearing at step 5.
