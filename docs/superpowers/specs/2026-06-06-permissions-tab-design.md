# Permissions Tab Design

**Date:** 2026-06-06
**Scope:** Promote the bucket health report from a standalone page into the existing "Permissions" tab on the bucket detail page, and simplify the Overview tab's PermissionsCard to a compact summary.

---

## Goal

The "Permissions" tab in the bucket detail view is currently a "coming soon" placeholder. This spec replaces it with the full health report, removes the now-redundant standalone `/health` page, and trims the Overview tab's `PermissionsCard` to a compact status summary.

---

## Changes

### 1. New `src/components/buckets/permissions-tab.tsx`

A new client component that owns everything the standalone health page currently owns, minus the navigation chrome:

- **Lazy-run:** `useEffect` fires `useRunBucketHealth().mutate()` once when `report === null` and no run is in flight — identical to the logic currently in `PermissionsCard`.
- **Loading state:** spinner + "Running initial permission check…" while `isLoading` or `(report === null && runHealth.isPending)`.
- **Error state:** brief error message + Retry button.
- **Loaded state:** `<HealthReportView>` with `onRefresh` and `isRefreshing` wired to `useRunBucketHealth`.

Props: `{ connectionId: string; bucket: string }`.

The component renders directly inside the tab's scroll container — no container/max-width wrapper (the tab chrome provides padding already).

### 2. `src/components/buckets/bucket-detail-tabs.tsx` (modified)

Replace the `permissions` branch:

```tsx
// before
{activeTab === "permissions" && <ComingSoonTab ... />}

// after
{activeTab === "permissions" && (
  <PermissionsTab connectionId={connectionId} bucket={bucket} />
)}
```

Import `PermissionsTab` from `./permissions-tab`.

### 3. `src/components/health/permissions-card.tsx` (simplified)

The card shrinks to a compact status summary. It **retains the lazy-run `useEffect`** (Overview tab still triggers the initial probe), but removes the per-capability icon grid and the Refresh button.

**Compact loaded state shows:**

- Title: "Permissions"
- Subtitle: `{available} of {total} available` — same wording as today, plus ` · {unavailable} unavailable` when > 0, ` · {unsupported} unsupported` when > 0.
- Connectivity warning: if `report.connectivity !== "ok"`, show a small badge/line indicating the connection issue (e.g., "Endpoint unreachable").
- Link: `View permissions →` pointing to `?tab=permissions` (relative, using the current pathname).

Remove: per-capability rows, Refresh button (`StatusIcon` helper becomes unused and is also removed).

**Link target construction:** use `usePathname()` + `?tab=permissions` rather than hard-coding the bucket path, so the card stays decoupled from the URL structure.

### 4. `src/app/(dashboard)/buckets/[connectionId]/[bucket]/health/page.tsx` (replaced)

Delete the current page body. Replace with a server-side redirect:

```tsx
import { redirect } from "next/navigation";

export default async function BucketHealthPage({
  params,
}: {
  params: Promise<{ connectionId: string; bucket: string }>;
}) {
  const { connectionId, bucket } = await params;
  redirect(`/buckets/${connectionId}/${encodeURIComponent(bucket)}?tab=permissions`);
}
```

This preserves the URL for anyone who bookmarked the old health page.

### 5. `src/components/health/capability-gate.tsx` (updated link)

Change the bucket `reportHref` from:

```ts
`/buckets/${connectionId}/${encodeURIComponent(bucket)}/health`
```

to:

```ts
`/buckets/${connectionId}/${encodeURIComponent(bucket)}?tab=permissions`
```

---

## File Summary

| File | Action |
|------|--------|
| `src/components/buckets/permissions-tab.tsx` | **New** — full report + lazy-run logic |
| `src/components/buckets/bucket-detail-tabs.tsx` | **Modified** — render `PermissionsTab` instead of `ComingSoonTab` |
| `src/components/health/permissions-card.tsx` | **Modified** — compact summary only |
| `src/app/(dashboard)/buckets/[connectionId]/[bucket]/health/page.tsx` | **Replaced** — redirect to `?tab=permissions` |
| `src/components/health/capability-gate.tsx` | **Modified** — update bucket `reportHref` |

---

## What Is Not Changing

- The `HealthReportView` component (`health-report.tsx`) is used as-is.
- The connection-level health page (`/connections/[id]/health`) is unchanged.
- No schema, API, or query hook changes.
- The `PermissionsCard` still lives in `src/components/health/` — only its rendered output changes, not its location.
- The "Lifecycle rules" tab remains a coming-soon placeholder.

---

## Acceptance Criteria

1. Clicking the **Permissions** tab on any bucket detail page shows the full `HealthReportView` (or loading/error state while the initial check runs).
2. If no health record exists yet, the tab auto-runs the check on first render (lazy-run).
3. The **Refresh** button in `HealthReportView` re-runs the check and updates the view.
4. The **Overview** tab still shows a `PermissionsCard` but in compact form: count summary + "View permissions →" link; no capability row list, no Refresh button.
5. Navigating to `/buckets/[connectionId]/[bucket]/health` redirects to `?tab=permissions`.
6. Tooltips from `CapabilityGate` link to `?tab=permissions`, not the old `/health` path.
7. TypeScript compiles clean (`pnpm tsc --noEmit`).
