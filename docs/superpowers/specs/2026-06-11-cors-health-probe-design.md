# CORS Health Probe & Fix Action Design

**Date:** 2026-06-11
**Scope:** Add a `corsDirectUploads` capability to the bucket health check that probes whether the bucket has CORS configured for direct browser uploads, a Fix action that merges the required rule via `PutBucketCors`, and a reactive "Check permissions" link in the upload manager when a CORS error is detected.

---

## Goal

Direct-to-S3 uploads require the bucket to have a CORS rule allowing `PUT` from the browser and exposing the `ETag` header. Currently the Permissions tab shows `s3:PutObject` as green even when CORS is missing, giving no signal that direct uploads will fail. This spec adds:

1. A probe that detects missing or incomplete CORS config
2. A one-click Fix that applies the required rule (merging with existing rules)
3. A reactive link in the upload manager when an upload fails due to CORS

---

## Changes

### 1. New capability: `corsDirectUploads` in `src/lib/health/capabilities.ts`

Add a new entry to the capabilities map:

```ts
corsDirectUploads: {
  label: "Direct uploads (CORS)",
  description: "Browser can upload files directly to this bucket using presigned URLs.",
  requiredActions: ["s3:GetBucketCors"],
  fixAction: "apply-cors",
  affectedFeatures: ["File uploads"],
}
```

The `fixAction` field is new — a string token the capability row uses to decide whether to render a Fix button. Only `corsDirectUploads` uses it initially.

### 2. New probe: `corsDirectUploads` in `src/lib/health/probes/bucket.ts`

```ts
async function probeCorsDirectUploads(client: S3Client, bucket: string): Promise<ProbeResult> {
  try {
    const { CORSRules } = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    const valid = (CORSRules ?? []).some(
      r =>
        r.AllowedMethods?.includes("PUT") &&
        r.ExposeHeaders?.includes("ETag")
    );
    return valid ? { status: "granted" } : { status: "denied", reason: "misconfigured" };
  } catch (err) {
    if (isNoSuchCorsConfiguration(err)) {
      return { status: "denied", reason: "not_configured" };
    }
    return { status: "error", error: String(err) };
  }
}
```

Two distinct denial reasons surface different descriptions in the UI:
- `not_configured` → "No CORS rules are configured on this bucket."
- `misconfigured` → "CORS rules exist but none allow PUT with ETag exposed."

`GetBucketCorsCommand` is already in `@aws-sdk/client-s3`.

The existing `ProbeResult` type needs an optional `reason?: string` field added to carry the denial detail through to the stored record and the UI. If the type already has a generic `detail` or `message` field, use that instead.

### 3. New API route: `POST /api/connections/[id]/buckets/[bucket]/apply-cors`

New file: `src/app/api/connections/[id]/buckets/[bucket]/apply-cors/route.ts`

Logic:
1. Fetch connection + build S3 client (same pattern as other bucket routes)
2. `GetBucketCors` — collect existing rules; treat `NoSuchCORSConfiguration` as empty array
3. Prepend the required rule so it wins over any conflicting existing rule:
   ```json
   {
     "AllowedOrigins": ["*"],
     "AllowedMethods": ["PUT"],
     "AllowedHeaders": ["*"],
     "ExposeHeaders": ["ETag"],
     "MaxAgeSeconds": 3000
   }
   ```
4. `PutBucketCors` with `[requiredRule, ...existingRules]`
5. Trigger a new health check run (same call as `POST /api/connections/[id]/buckets/[bucket]/health-check`)
6. Return `{ ok: true }`

Error handling:
- **403 / AccessDenied** → `400` with `{ error: "These credentials don't have permission to update CORS. Apply the config manually using the AWS CLI or your provider's console." }`
- **Other S3 errors** → `500` with the S3 error message

Auth: `withAuth` with ADMIN role check, same as other mutation routes.

### 4. UI: Fix button in capability row

`src/components/health/capability-row.tsx` gains a Fix button rendered in the expand panel when:
- The capability has a `fixAction` token, AND
- The probe status is `denied`

The button label is "Fix". Behaviour:
- Calls `POST /api/connections/[id]/buckets/[bucket]/apply-cors`
- Loading spinner while in-flight; button disabled
- **Success:** health check re-run is triggered server-side; client invalidates the health query so the row refreshes
- **Error:** error message rendered inline below the button; button re-enables

The expand panel also shows the denial reason as a human-readable line above the Fix button:
- `not_configured` → "No CORS rules are configured on this bucket."
- `misconfigured` → "CORS rules exist but none allow PUT with ETag exposed."

`connectionId` and `bucket` are passed down to `capability-row` from `health-report-view` (already available in the component tree).

### 5. Reactive link in upload manager

`src/lib/uploads/transport.ts` already sets a CORS-specific error message when ETag is missing from the part response. No change needed there.

`src/components/browser/upload-manager.tsx`: when rendering an `UploadItem` in `error` state, check if `item.error` includes `"CORS"` (present in the existing message from `transport.ts`). If so, render a `"Check permissions"` link below the error text:

```
/app/buckets/[item.connectionId]/[item.bucket]?tab=permissions
```

Both fields are already on `UploadItem`. The link uses Next.js `<Link>` and opens in the same tab.

---

## Data Flow

```
Health check run
  → probeCorsDirectUploads() calls GetBucketCors
  → result stored in bucketPermissionCheck table
  → HealthReportView renders capability row with Fix button if denied

Fix button clicked
  → POST /api/connections/[id]/buckets/[bucket]/apply-cors
  → GetBucketCors (existing) + PutBucketCors (prepend rule)
  → triggers health check re-run
  → client invalidates health query → row refreshes to "granted"

Upload fails (CORS)
  → transport.ts sets error string with CORS hint
  → upload-manager renders "Check permissions" link → permissions tab
```

---

## Error States

| Scenario | User sees |
|----------|-----------|
| Probe: no CORS config | "No CORS rules are configured" + Fix button |
| Probe: rules exist but incomplete | "Rules exist but none allow PUT with ETag exposed" + Fix button |
| Fix: credentials lack `s3:PutBucketCors` | Inline error explaining manual steps |
| Fix: other S3 error | Inline error with S3 message |
| Upload fails with CORS | Error text + "Check permissions" link to permissions tab |

---

## Out of Scope

- Showing or editing individual CORS rules in the UI
- Detecting CORS errors for GET/HEAD requests (only upload path is covered)
- Adding `s3:PutBucketCors` to the IAM capability probes
