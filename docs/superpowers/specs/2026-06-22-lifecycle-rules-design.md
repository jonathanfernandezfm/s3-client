# Lifecycle Rules Design

**Date:** 2026-06-22
**Scope:** Replace the "Lifecycle rules" ComingSoonTab with a real implementation. v1 ships two capabilities: (1) a read path that lists existing lifecycle rules for any provider that supports `GetBucketLifecycleConfiguration`, and (2) a guided "Auto-abort incomplete uploads after N days" rule creator using `AbortIncompleteMultipartUpload`. A `lifecycle` probe is added to the bucket health-probe registry so unsupported providers show a "not supported" indicator instead of an error. Expiration rules, storage-class transitions, tag/size filters, and free-form rule editing are explicitly deferred to v2.

---

## Goal

The shipped bucket-detail page makes a visible promise to every user: the "Lifecycle rules" tab renders a coming-soon placeholder that reads "Configure auto-deletion, storage-class transitions, and auto-aborting of incomplete uploads." No backing code exists anywhere in `src/`. Every other tab on that page is real.

The highest-value starting point is the `AbortIncompleteMultipartUpload` rule type, for two reasons. First, the Incomplete-uploads tab (which lives right next to Lifecycle in the tab bar) already teaches users that abandoned multipart uploads cost money; a lifecycle rule that auto-aborts them after N days is the obvious next step. Second, this rule type does not delete user data, so it carries less risk than expiration rules and does not require a confirmation dialog in v1.

The read path is shipped alongside the first write action because displaying existing rules before offering to add one prevents duplicates and is a cleaner mental model for the user.

---

## Changes

### 1. New API route: `GET /api/connections/[id]/buckets/[bucket]/lifecycle`

New file: `src/app/api/connections/[id]/buckets/[bucket]/lifecycle/route.ts`

Auth: `withAuth` — any role with connection access (read is open to VIEWER).

Logic:
1. `getConnectionAccessById(id, user.id)` — 404 if missing.
2. `createS3Client(access.connection)`.
3. Call `GetBucketLifecycleConfigurationCommand({ Bucket: bucket })`.
4. `NoSuchLifecycleConfiguration` (or `NoSuchLifecycleConfiguration` alias from MinIO) → return `{ rules: [] }` (treat as empty, not an error — mirrors how `apply-cors` handles `NoSuchCORSConfiguration`).
5. `NotImplemented` / HTTP 501 → return `{ rules: [], unsupported: true }`.
6. `AccessDenied` / HTTP 403 → `400` with `{ error: "These credentials don't have permission to read lifecycle configuration." }`.
7. Other errors → `500`.

Response shape:
```ts
interface LifecycleRule {
  id?: string;
  status: "Enabled" | "Disabled";
  filter?: {
    prefix?: string;
    tag?: { key: string; value: string };
    objectSizeGreaterThan?: number;
    objectSizeLessThan?: number;
  };
  expiration?: { days?: number; date?: string; expiredObjectDeleteMarker?: boolean };
  abortIncompleteMultipartUpload?: { daysAfterInitiation: number };
  transitions?: Array<{ days?: number; storageClass: string }>;
  noncurrentVersionExpiration?: { noncurrentDays?: number };
  noncurrentVersionTransitions?: Array<{ noncurrentDays?: number; storageClass: string }>;
}

interface GetLifecycleResponse {
  rules: LifecycleRule[];
  unsupported?: true;
}
```

### 2. New API route: `POST /api/connections/[id]/buckets/[bucket]/lifecycle`

Same file: `src/app/api/connections/[id]/buckets/[bucket]/lifecycle/route.ts` (add `POST` export).

Auth: `withAuth` — ADMIN or EDITOR only (use `canManageFiles(access.role)` from `src/lib/roles.ts`).

v1 accepts only the `AbortIncompleteMultipartUpload` action:

```ts
interface CreateAbortRuleBody {
  daysAfterInitiation: number;   // positive integer; validated server-side
  prefix?: string;               // optional key prefix filter; empty string = all objects
}
```

Logic follows the apply-cors read-merge-write pattern so existing rules are never clobbered:
1. `GetBucketLifecycleConfiguration` — collect existing rules; treat `NoSuchLifecycleConfiguration` as `[]`.
2. Check for an existing `AbortIncompleteMultipartUpload` rule with the same prefix. If one exists, return `400` with `{ error: "An auto-abort rule already exists for this prefix. Delete it first or edit the existing rule." }` — v1 has no edit UI, so a duplicate would be invisible.
3. Build new rule:
   ```ts
   const newRule: LifecycleRule = {
     id: `s3client-abort-${Date.now()}`,
     status: "Enabled",
     filter: prefix ? { prefix } : { prefix: "" },
     abortIncompleteMultipartUpload: { daysAfterInitiation: body.daysAfterInitiation },
   };
   ```
4. `PutBucketLifecycleConfigurationCommand({ Bucket, LifecycleConfiguration: { Rules: [...existingRules, newRule] } })`.
5. Return `{ ok: true, rule: newRule }`.

Error handling:
- `AccessDenied` / 403 → `400` with actionable message.
- `MalformedXML` / 400 from provider → `400` forwarding the S3 message.
- Other S3 errors → `500`.

### 3. New capability: `lifecycle-management` in `src/lib/health/probe.ts`

Add `"lifecycle-management"` to the `CapabilityKey` union.

### 4. New probe: `getBucketLifecycle` in `src/lib/health/probes/bucket.ts`

```ts
import {
  GetBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";

const getBucketLifecycle: Probe = {
  key: "get-bucket-lifecycle",
  capability: "lifecycle-management",
  scope: "bucket",
  required: true,
  async run({ client, bucket }): Promise<ProbeRunOutcome> {
    const start = performance.now();
    try {
      await client.send(
        new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }),
      );
      return { result: "granted", durationMs: elapsed(start) };
    } catch (err) {
      const e = err as { name?: string; Code?: string };
      const name = e.name ?? e.Code ?? "";
      if (name === "NoSuchLifecycleConfiguration") {
        // Empty config is still a granted capability
        return { result: "granted", durationMs: elapsed(start) };
      }
      const { result, errorCode } = classifyError(err);
      return { result, errorCode, durationMs: elapsed(start) };
    }
  },
};
```

Add `getBucketLifecycle` to `BUCKET_PROBES`.

The `classifyError` function already maps `NotImplemented` / HTTP 501 to `"unsupported"`, so providers that don't support lifecycle will surface as `unsupported` through the existing health-report UI without special-casing.

### 5. New capability entry in `src/lib/health/capabilities.ts`

```ts
"lifecycle-management": {
  label: "Lifecycle rules",
  description: "Read and write bucket lifecycle rules (expiration, abort-incomplete).",
  requiredActions: ["s3:GetLifecycleConfiguration", "s3:PutLifecycleConfiguration"],
  affectedFeatures: ["Lifecycle rules tab"],
}
```

### 6. New tab component: `src/components/buckets/lifecycle-tab.tsx`

Replaces `<ComingSoonTab>` for the `lifecycle` branch in `bucket-detail-tabs.tsx`.

Props: `{ connectionId: string; bucket: string; canCreate: boolean }`.

States:

| State | UI |
|---|---|
| Loading | Centered spinner |
| Unsupported | `<ComingSoonTab>` variant: icon + "This provider does not support lifecycle rules." |
| AccessDenied | Error state with message |
| Empty (no rules) | Info panel explaining what lifecycle rules are + "Add auto-abort rule" button (disabled if `!canCreate`) |
| Has rules | Rule list (see below) + "Add auto-abort rule" button |
| Create rule form open | Inline form (see below) |

Rule list (read path): each rule renders as a card with:
- Rule ID (or "Unnamed rule")
- Status badge (Enabled / Disabled)
- Filter summary (prefix or "All objects")
- Actions summary: one chip per action type (e.g., "Abort incomplete uploads after 7 days", "Expire after 30 days")

Add auto-abort rule form (inline, toggled by button):
```
Days until incomplete uploads are aborted: [  7  ] days
Key prefix filter (optional):             [       ]
                             [Cancel]  [Save rule]
```

`daysAfterInitiation` must be a positive integer. Validation runs client-side before submit. The server also validates and returns a `400` on invalid input.

On success: close form, invalidate `queryKeys.lifecycle.byBucket(connectionId, bucket)`, show notification via `useNotificationStore`.

### 7. `src/components/buckets/bucket-detail-tabs.tsx` (modified)

Replace the `lifecycle` branch:
```tsx
// before
{activeTab === "lifecycle" && (
  <ComingSoonTab
    title="Lifecycle rules coming soon"
    description="Configure auto-deletion, storage-class transitions, and auto-aborting of incomplete uploads."
  />
)}

// after
{activeTab === "lifecycle" && (
  <LifecycleTab
    connectionId={connectionId}
    bucket={bucket}
    canCreate={canManageFiles(connection?.role ?? null)}
  />
)}
```

Also remove the `badge: "Soon"` from the lifecycle entry in `TAB_DEFINITIONS`.

### 8. New query hooks: `src/lib/queries/lifecycle.ts`

```ts
export function useLifecycleRules(connectionId: string, bucket: string) {
  return useQuery({
    queryKey: queryKeys.lifecycle.byBucket(connectionId, bucket),
    queryFn: () => fetchLifecycleRules(connectionId, bucket),
    enabled: !!connectionId && !!bucket,
    retry: (failureCount, error) => {
      // Don't retry AccessDenied or Unsupported
      if (error instanceof LifecycleError && (error.code === "access_denied" || error.code === "unsupported")) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

export function useCreateAbortRule(connectionId: string, bucket: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAbortRuleBody) =>
      createAbortRule(connectionId, bucket, body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.lifecycle.byBucket(connectionId, bucket),
      });
    },
  });
}
```

### 9. New query key namespace in `src/lib/queries/keys.ts`

```ts
lifecycle: {
  all: ["lifecycle"] as const,
  byBucket: (connectionId: string, bucket: string) =>
    [...queryKeys.lifecycle.all, connectionId, bucket] as const,
},
```

---

## Data Flow

```
LifecycleTab mounts
  → useLifecycleRules(connectionId, bucket)
      → GET /api/connections/[id]/buckets/[bucket]/lifecycle
          → GetBucketLifecycleConfigurationCommand
          → NoSuchLifecycleConfiguration → { rules: [] }
          → NotImplemented → { rules: [], unsupported: true }
          → Success → { rules: [...] }
      → Render rule list or empty state

User clicks "Add auto-abort rule"
  → Inline form opens
  → User enters daysAfterInitiation (+ optional prefix)
  → [Save rule] clicked
      → useCreateAbortRule.mutate({ daysAfterInitiation, prefix })
          → POST /api/connections/[id]/buckets/[bucket]/lifecycle
              → GetBucketLifecycleConfiguration (read existing)
              → Duplicate check
              → PutBucketLifecycleConfiguration (merge: existing + new rule)
              → { ok: true, rule: newRule }
      → invalidate lifecycle query → list refreshes
      → useNotificationStore.addNotification("Rule saved")

Lifecycle probe (health check run)
  → GetBucketLifecycleConfigurationCommand
  → NoSuchLifecycleConfiguration → result: "granted"
  → NotImplemented / 501 → result: "unsupported"
  → AccessDenied / 403 → result: "denied"
  → Permissions tab reflects lifecycle-management capability
```

---

## Error States

| Scenario | HTTP status | User sees |
|---|---|---|
| Provider doesn't support lifecycle (`NotImplemented` / 501) | — (probe: `unsupported`) | "This provider does not support lifecycle rules." info panel |
| No rules configured (`NoSuchLifecycleConfiguration`) | — (treated as success) | Empty state with "Add auto-abort rule" button |
| `AccessDenied` on `GetBucketLifecycle` | 400 from API | Error panel with message; no create button shown |
| `AccessDenied` on `PutBucketLifecycle` | 400 from API | Inline form error; rule not saved |
| Duplicate abort rule for same prefix | 400 from API | Form validation error: "An auto-abort rule already exists for this prefix." |
| Invalid `daysAfterInitiation` (≤ 0 or non-integer) | 400 from API | Client-side validation fires first; server-side as fallback |
| General S3 error on write | 500 from API | Inline form error with S3 message |

---

## Provider Compatibility

The following table covers S3 lifecycle API (`GetBucketLifecycleConfiguration` / `PutBucketLifecycleConfiguration`) feature support by provider. Cells marked "unverified" were not confirmed against live provider documentation or tested during this spike; they are best-effort estimates based on general knowledge of each provider's S3 API surface.

| Feature | AWS S3 | MinIO | Cloudflare R2 | Backblaze B2 |
|---|---|---|---|---|
| `GetBucketLifecycleConfiguration` | Supported ([AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetBucketLifecycleConfiguration.html)) | Supported ([MinIO docs](https://min.io/docs/minio/linux/administration/object-management/object-lifecycle-management.html)) | Supported ([R2 docs](https://developers.cloudflare.com/r2/api/s3/api/#bucket-level-operations)) | Unverified |
| `PutBucketLifecycleConfiguration` | Supported ([AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutBucketLifecycleConfiguration.html)) | Supported | Supported | Unverified |
| `AbortIncompleteMultipartUpload` action | Supported | Supported | Unverified | Unverified |
| Expiration (`Expiration.Days`) | Supported | Supported | Supported | Unverified |
| Storage-class transitions | Supported | Supported (limited storage classes) | Not supported (R2 has one storage tier) | Unverified |
| Prefix filter | Supported | Supported | Supported | Unverified |
| Tag-based filter | Supported | Supported | Unverified | Unverified |
| Object-size filter (`ObjectSizeGreaterThan` / `ObjectSizeLessThan`) | Supported (added 2022) | Unverified | Unverified | Unverified |
| `NoSuchLifecycleConfiguration` error on empty config | Yes (standard) | Yes | Unverified | Unverified |
| `NotImplemented` / 501 on unsupported | N/A — AWS always supports | N/A — MinIO always supports | Unverified for missing sub-features | Unverified |

**Implementation note on `NoSuchLifecycleConfiguration`**: AWS S3 and MinIO both throw this error code (not an HTTP 404) when no lifecycle configuration exists. The read path must special-case this error name to return an empty array. Any provider that deviates (e.g., returns HTTP 404 with a different error body) will surface as an unexpected `error` result in the probe; a follow-up fix would add the provider's error code to the special-case list.

---

## Open Questions

1. **Should lifecycle rule creation require ADMIN or is EDITOR sufficient?**
   Recommended: use `canManageFiles` (ADMIN or EDITOR), matching the multipart-abort permission. Lifecycle rules that abort incomplete uploads are analogous in risk to aborting those uploads manually. Expiration rules (v2) may warrant a stricter gate since they delete user data.

2. **Should the lifecycle probe be `required: true` or `required: false`?**
   Recommended: `required: false` — treat it like the CORS probe. An unsupported lifecycle API should not fail a health check that is otherwise green; it should just surface as "unsupported" in the capability row. Setting `required: false` requires adding that field support to the `Probe` interface if it only accepts `true` today — check the current probe runner logic.

3. **How should the Lifecycle tab render on providers where the probe result is `unsupported`?**
   Recommended: hide the "Add auto-abort rule" button entirely and show a provider-specific info panel. The tab should still render the rule list if `GetBucketLifecycleConfiguration` returns rules (some providers support read but not write). The API response's `unsupported: true` flag drives this, not the health report.

4. **Should the GET route be at `/api/connections/[id]/buckets/[bucket]/lifecycle` (REST-style) or `/api/buckets/[bucket]/lifecycle` with `connectionId` in the body (matching the multipart-uploads route style)?**
   Recommended: use the connection-scoped path `/api/connections/[id]/buckets/[bucket]/lifecycle`, which mirrors `apply-cors`. The multipart route is on a different base path because it predates the connection-scoped routing convention. New bucket-config routes should follow the connection-scoped pattern.

5. **What is the maximum number of lifecycle rules per bucket?**
   AWS S3 supports up to 1,000 rules per bucket. The v1 list view renders all rules without pagination. If a bucket has hundreds of rules (unusual in practice), the list may become unwieldy. Recommended: add a count warning if `rules.length > 50`, but no pagination in v1.

6. **Does Cloudflare R2 support `AbortIncompleteMultipartUpload` lifecycle actions?**
   The R2 lifecycle documentation as of mid-2025 lists expiration rules as supported but does not explicitly confirm `AbortIncompleteMultipartUpload`. This must be verified against R2's current documentation before marking that cell as supported.

---

## Out of Scope

The following are explicitly deferred to v2 or later:

- **Free-form rule builder** — creating expiration rules, transition rules, or noncurrent-version rules through a UI. These require careful UX for date vs. days, storage-class selection (provider-dependent), and filter combinations.
- **Storage-class transitions** — the valid storage-class values differ across providers (AWS has STANDARD_IA, GLACIER, DEEP_ARCHIVE, etc.; MinIO has a subset; R2 has none). A transition builder requires provider-aware storage-class enumeration.
- **Tag-based and object-size filters** — adds combinatorial complexity to the rule creation form.
- **Rule editing** — the S3 API has no PATCH for lifecycle rules; editing requires a full read-merge-rewrite cycle. The v1 approach (append-only, duplicate-check) avoids the merge-conflict problem.
- **Rule deletion UI** — deletion requires identifying which rule to remove from the array and calling `PutBucketLifecycleConfiguration` with the rule removed (or `DeleteBucketLifecycle` to remove all rules at once). Deferred because it requires a confirmation UX and the destructive-action safety gate described below.
- **Expiration-rule creation** — expiration rules permanently delete user objects. Any UI that creates expiration rules must include a confirmation dialog ("This rule will permanently delete objects after N days. Are you sure?") and should be gated to ADMIN only. This is out of scope for v1 because the risk profile is substantially higher than abort-incomplete rules.
- **`DeleteBucketLifecycle` (remove all rules)** — a bulk-delete action for lifecycle config; too destructive for v1.
- **Lifecycle rule status toggle (Enabled ↔ Disabled)** — requires the same read-merge-rewrite cycle as editing.
- **Cost estimation** — displaying estimated savings from an auto-abort rule requires object count and storage-class data not available from the lifecycle API alone.
