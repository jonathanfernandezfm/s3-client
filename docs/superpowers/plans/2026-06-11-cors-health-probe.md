# CORS Health Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `cors-direct-uploads` capability to the bucket health check that detects missing/misconfigured CORS, a Fix button that applies the required rule, and a reactive "Check permissions" link in the upload manager on CORS errors.

**Architecture:** Extend the existing probe/capability/rollup pipeline with a new `cors-direct-uploads` entry. A new `POST /apply-cors` route reads existing CORS rules, prepends the required rule, and triggers a fresh health check run. The capability row gains a Fix button when the probe is `unavailable`; the upload manager surfaces a link when the error message contains `"CORS"`.

**Tech Stack:** Next.js App Router API routes, AWS SDK v3 (`GetBucketCorsCommand`, `PutBucketCorsCommand`), React Query mutations, Vitest, TypeScript.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `src/lib/health/probe.ts` — add `"cors-direct-uploads"` to `CapabilityKey`; add `fixAction?` to `CapabilityReport` |
| Modify | `src/lib/health/capabilities.ts` — add `fixAction?` to `CapabilityDefinition`; add `cors-direct-uploads` entry |
| Modify | `src/lib/health/rollup.ts` — propagate `fixAction` in `buildCapabilities` |
| Modify | `src/lib/health/rollup.test.ts` — test `fixAction` propagation |
| Modify | `src/lib/health/probes/bucket.ts` — add `corsDirectUploads` probe |
| Create | `src/app/api/connections/[id]/buckets/[bucket]/apply-cors/route.ts` |
| Modify | `src/lib/queries/health.ts` — add `useApplyCorsFix` mutation hook |
| Modify | `src/components/health/capability-row.tsx` — Fix button + denial reason text |
| Modify | `src/components/health/health-report.tsx` — wire fix hook, pass props to rows |
| Modify | `src/components/browser/upload-manager.tsx` — "Check permissions" link on CORS error |

---

### Task 1: Extend types — `CapabilityKey`, `CapabilityDefinition`, `CapabilityReport`

**Files:**
- Modify: `src/lib/health/probe.ts`
- Modify: `src/lib/health/capabilities.ts`

- [ ] **Step 1: Add `"cors-direct-uploads"` to `CapabilityKey` in `probe.ts`**

Open `src/lib/health/probe.ts`. The `CapabilityKey` union (lines 4–16) ends with `"view-multipart"`. Add the new key:

```ts
export type CapabilityKey =
  | "browse-buckets"
  | "create-buckets"
  | "delete-buckets"
  | "browse-objects"
  | "download-objects"
  | "upload-objects"
  | "delete-objects"
  | "copy-objects"
  | "object-tagging"
  | "list-versions"
  | "manage-versioning"
  | "view-multipart"
  | "cors-direct-uploads";
```

- [ ] **Step 2: Add `fixAction?` to `CapabilityReport` in `probe.ts`**

The `CapabilityReport` interface (lines 65–76) ends with `affects: string[]`. Add one field:

```ts
export interface CapabilityReport {
  key: CapabilityKey;
  label: string;
  status: CapabilityStatus;
  probes: Array<{
    key: string;
    result: ProbeResult;
    errorCode?: string;
  }>;
  requiredIamActions: string[];
  affects: string[];
  fixAction?: string;
}
```

- [ ] **Step 3: Add `fixAction?` to `CapabilityDefinition` in `capabilities.ts`**

The `CapabilityDefinition` interface (lines 4–10) currently has five fields. Add one:

```ts
export interface CapabilityDefinition {
  key: CapabilityKey;
  label: string;
  scope: "connection" | "bucket";
  requiredIamActions: string[];
  affects: string[];
  fixAction?: string;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/health/probe.ts src/lib/health/capabilities.ts
git commit -m "feat(health): extend types for cors-direct-uploads capability"
```

---

### Task 2: Propagate `fixAction` through rollup

**Files:**
- Modify: `src/lib/health/rollup.ts`
- Modify: `src/lib/health/rollup.test.ts`

- [ ] **Step 1: Write the failing test**

Open `src/lib/health/rollup.test.ts`. Add this test inside the existing `describe("buildCapabilities", ...)` block (after the last test):

```ts
test("capability with fixAction propagates it to the report", () => {
  // cors-direct-uploads is the only capability with fixAction set
  const caps = buildCapabilities("bucket", [
    probe("get-bucket-cors", "cors-direct-uploads", "denied"),
  ]);
  const cors = caps.find((c) => c.key === "cors-direct-uploads");
  expect(cors).toBeDefined();
  expect(cors?.fixAction).toBe("apply-cors");
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm vitest run src/lib/health/rollup.test.ts
```

Expected: FAIL — `cors-direct-uploads` is not yet in `CAPABILITIES`, so `caps.find(...)` returns `undefined`.

- [ ] **Step 3: Propagate `fixAction` in `buildCapabilities` in `rollup.ts`**

The return inside `.map()` (lines 38–49) currently builds the `CapabilityReport` without `fixAction`. Add it:

```ts
return {
  key,
  label: def.label,
  status,
  probes: probesForCap.map((p) => ({
    key: p.key,
    result: p.result,
    errorCode: p.errorCode,
  })),
  requiredIamActions: def.requiredIamActions,
  affects: def.affects,
  fixAction: def.fixAction,
};
```

- [ ] **Step 4: Commit the rollup change (the new test stays failing until Task 3 adds the capability)**

```bash
git add src/lib/health/rollup.ts src/lib/health/rollup.test.ts
git commit -m "feat(health): propagate fixAction through buildCapabilities"
```

---

### Task 3: Add `cors-direct-uploads` capability and probe

**Files:**
- Modify: `src/lib/health/capabilities.ts`
- Modify: `src/lib/health/probes/bucket.ts`

- [ ] **Step 1: Add `cors-direct-uploads` to `CAPABILITIES` in `capabilities.ts`**

Add this entry to the `CAPABILITIES` record (after `"view-multipart"`, before the closing `}`):

```ts
"cors-direct-uploads": {
  key: "cors-direct-uploads",
  label: "Direct uploads (CORS)",
  scope: "bucket",
  requiredIamActions: ["s3:GetBucketCors"],
  affects: [
    "File uploads will fail with a CORS error in the browser",
  ],
  fixAction: "apply-cors",
},
```

- [ ] **Step 2: Run the rollup test — it should now pass**

```bash
pnpm vitest run src/lib/health/rollup.test.ts
```

Expected: PASS — all tests pass.

- [ ] **Step 3: Add `GetBucketCorsCommand` import to `probes/bucket.ts`**

The import block at the top of `src/lib/health/probes/bucket.ts` currently starts with `CopyObjectCommand`. Add `GetBucketCorsCommand` to the list:

```ts
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetBucketVersioningCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
} from "@aws-sdk/client-s3";
```

- [ ] **Step 4: Add the `corsDirectUploads` probe to `probes/bucket.ts`**

Add this probe definition after the `listMultipartUploads` const (before the `BUCKET_PROBES` export):

```ts
const corsDirectUploads: Probe = {
  key: "get-bucket-cors",
  capability: "cors-direct-uploads",
  scope: "bucket",
  required: true,
  async run({ client, bucket }): Promise<ProbeRunOutcome> {
    const start = performance.now();
    try {
      const { CORSRules } = await client.send(
        new GetBucketCorsCommand({ Bucket: bucket }),
      );
      const valid = (CORSRules ?? []).some(
        (r) =>
          r.AllowedMethods?.includes("PUT") &&
          r.ExposeHeaders?.includes("ETag"),
      );
      if (valid) {
        return { result: "granted", durationMs: elapsed(start) };
      }
      return { result: "denied", errorCode: "misconfigured", durationMs: elapsed(start) };
    } catch (err) {
      const e = err as { name?: string; Code?: string };
      const name = e.name ?? e.Code ?? "";
      if (name === "NoSuchCORSConfiguration") {
        return { result: "denied", errorCode: "not_configured", durationMs: elapsed(start) };
      }
      const { result, errorCode } = classifyError(err);
      return { result, errorCode, durationMs: elapsed(start) };
    }
  },
};
```

- [ ] **Step 5: Add `corsDirectUploads` to `BUCKET_PROBES`**

The `BUCKET_PROBES` array export (line 261) currently ends with `listMultipartUploads`. Add the new probe:

```ts
export const BUCKET_PROBES: Probe[] = [
  listObjects,
  headObject,
  putObject,
  deleteObject,
  copyObject,
  getObjectTagging,
  putObjectTagging,
  listObjectVersions,
  getBucketVersioning,
  putBucketVersioning,
  listMultipartUploads,
  corsDirectUploads,
];
```

- [ ] **Step 6: Run all health tests**

```bash
pnpm vitest run src/lib/health/
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/health/capabilities.ts src/lib/health/probes/bucket.ts
git commit -m "feat(health): add cors-direct-uploads capability and GetBucketCors probe"
```

---

### Task 4: Add `POST /apply-cors` API route

**Files:**
- Create: `src/app/api/connections/[id]/buckets/[bucket]/apply-cors/route.ts`

- [ ] **Step 1: Create the route file**

Create `src/app/api/connections/[id]/buckets/[bucket]/apply-cors/route.ts` with this content:

```ts
// src/app/api/connections/[id]/buckets/[bucket]/apply-cors/route.ts
import { NextResponse } from "next/server";
import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  type CORSRule,
} from "@aws-sdk/client-s3";
import { withAuth } from "@/lib/auth";
import { getConnectionAccessById } from "@/lib/db/connections";
import { createS3Client } from "@/lib/s3/client";
import { decrypt } from "@/lib/crypto";
import prisma from "@/lib/db/prisma";
import { runBucketHealthCheck } from "@/lib/health/runner";

type RouteContext = { params: Promise<{ id: string; bucket: string }> };

const REQUIRED_CORS_RULE: CORSRule = {
  AllowedOrigins: ["*"],
  AllowedMethods: ["PUT"],
  AllowedHeaders: ["*"],
  ExposeHeaders: ["ETag"],
  MaxAgeSeconds: 3000,
};

export const POST = withAuth<RouteContext>(
  async (_req, { user, params }) => {
    const { id, bucket } = params; // withAuth resolves the params Promise before calling the handler

    const access = await getConnectionAccessById(id, user.id);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const connection = await prisma.connection.findUnique({ where: { id } });
    if (!connection) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const client = createS3Client({
      endpoint: connection.endpoint,
      accessKeyId: connection.accessKeyId,
      secretAccessKey: decrypt(connection.secretAccessKey),
      region: connection.region,
      forcePathStyle: connection.forcePathStyle,
    });

    // Fetch existing rules (empty if none configured)
    let existingRules: CORSRule[] = [];
    try {
      const { CORSRules } = await client.send(
        new GetBucketCorsCommand({ Bucket: bucket }),
      );
      existingRules = CORSRules ?? [];
    } catch (err) {
      const e = err as { name?: string; Code?: string };
      const name = e.name ?? e.Code ?? "";
      if (name !== "NoSuchCORSConfiguration") {
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    // Prepend required rule so it takes precedence over any conflicting existing rule
    try {
      await client.send(
        new PutBucketCorsCommand({
          Bucket: bucket,
          CORSConfiguration: {
            CORSRules: [REQUIRED_CORS_RULE, ...existingRules],
          },
        }),
      );
    } catch (err) {
      const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
      const name = e.name ?? e.Code ?? "";
      const status = e.$metadata?.httpStatusCode;
      if (name === "AccessDenied" || status === 403) {
        return NextResponse.json(
          {
            error:
              "These credentials don't have permission to update CORS. Apply the config manually using the AWS CLI or your provider's console.",
          },
          { status: 400 },
        );
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    // Refresh the health check so the probe result updates
    try {
      await runBucketHealthCheck(id, bucket);
    } catch {
      // Non-fatal — CORS was applied; the user can refresh manually
    }

    return NextResponse.json({ ok: true });
  },
);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | head -40
```

Expected: no type errors in the new file. If `params` needs `await` (Next.js 15 async params), it's already handled above.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/connections/[id]/buckets/[bucket]/apply-cors/route.ts
git commit -m "feat(health): add POST apply-cors route to merge CORS rule and refresh health check"
```

---

### Task 5: Add `useApplyCorsFix` mutation hook

**Files:**
- Modify: `src/lib/queries/health.ts`

- [ ] **Step 1: Add the `useApplyCorsFix` hook to `health.ts`**

Open `src/lib/queries/health.ts`. Add this hook after `useRunBucketHealth` (after line 155):

```ts
export function useApplyCorsFix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { connectionId: string; bucket: string }) => {
      const res = await fetch(
        `/api/connections/${vars.connectionId}/buckets/${encodeURIComponent(vars.bucket)}/apply-cors`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to apply CORS (${res.status})`);
      }
    },
    onSuccess: (_data, vars) => {
      // Server already ran a new health check; re-fetch the cached results
      qc.invalidateQueries({
        queryKey: queryKeys.health.bucket(vars.connectionId, vars.bucket),
      });
    },
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/health.ts
git commit -m "feat(health): add useApplyCorsFix mutation hook"
```

---

### Task 6: Update `CapabilityRow` with Fix button and denial reason

**Files:**
- Modify: `src/components/health/capability-row.tsx`

- [ ] **Step 1: Add new props to `CapabilityRowProps`**

Open `src/components/health/capability-row.tsx`. The current `CapabilityRowProps` interface (lines 49–52) has two fields. Replace it:

```ts
interface CapabilityRowProps {
  capability: CapabilityReport;
  defaultOpen?: boolean;
  connectionId?: string;
  bucket?: string;
  onFix?: () => void;
  isFixing?: boolean;
  fixError?: string;
}
```

- [ ] **Step 2: Update the function signature to accept new props**

Line 54 currently reads:
```ts
export function CapabilityRow({ capability, defaultOpen = false }: CapabilityRowProps) {
```

Replace with:
```ts
export function CapabilityRow({
  capability,
  defaultOpen = false,
  onFix,
  isFixing,
  fixError,
}: CapabilityRowProps) {
```

- [ ] **Step 3: Add the denial reason text and Fix button to the expand panel**

The expand panel `{open && (...)}` block (lines 84–141) currently shows required IAM actions, affects, and probe details. Add the denial reason and Fix button at the top of the expand panel, before the existing content. Insert this block right after `<div className="px-3 pb-3 pl-9 space-y-2 text-sm">` (line 85):

```tsx
{capability.status === "unavailable" && capability.fixAction && (
  <div className="space-y-2">
    <p className="text-sm text-muted-foreground">
      {capability.probes[0]?.errorCode === "not_configured"
        ? "No CORS rules are configured on this bucket."
        : "CORS rules exist but none allow PUT with ETag exposed."}
    </p>
    {onFix && (
      <div className="space-y-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onFix}
          disabled={isFixing}
        >
          {isFixing ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Applying…
            </>
          ) : (
            "Fix"
          )}
        </Button>
        {fixError && (
          <p className="text-xs text-destructive">{fixError}</p>
        )}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Add `Loader2` to the lucide-react import**

Line 4 currently imports from lucide-react. Add `Loader2`:

```ts
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Minus,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
} from "lucide-react";
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | head -40
```

Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/health/capability-row.tsx
git commit -m "feat(health): add Fix button and denial reason to CapabilityRow"
```

---

### Task 7: Wire fix hook in `HealthReportView`

**Files:**
- Modify: `src/components/health/health-report.tsx`

- [ ] **Step 1: Import `useApplyCorsFix`**

Open `src/components/health/health-report.tsx`. The current imports are `RefreshCw`, `AlertTriangle`, `Button`, `Card`, `CapabilityRow`, and `HealthReport`. Add the hook import:

```ts
import { useApplyCorsFix } from "@/lib/queries/health";
```

- [ ] **Step 2: Instantiate the hook inside `HealthReportView`**

Inside the `HealthReportView` function body, before the `return`, add:

```ts
const applyFix = useApplyCorsFix();
```

- [ ] **Step 3: Pass fix props to each `CapabilityRow`**

The `CapabilityRow` usage (line 88) currently passes only `key` and `capability`. Update it to pass the fix props. Only rows with a `fixAction` will show the button, but passing the props to all rows is harmless:

```tsx
<Card className="overflow-hidden">
  {report.capabilities.map((cap) => (
    <CapabilityRow
      key={cap.key}
      capability={cap}
      connectionId={report.connectionId}
      bucket={report.bucket}
      onFix={
        cap.fixAction
          ? () =>
              applyFix.mutate({
                connectionId: report.connectionId,
                bucket: report.bucket!,
              })
          : undefined
      }
      isFixing={applyFix.isPending}
      fixError={
        applyFix.isError && applyFix.variables?.bucket === report.bucket
          ? (applyFix.error as Error).message
          : undefined
      }
    />
  ))}
</Card>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/health/health-report.tsx
git commit -m "feat(health): wire useApplyCorsFix into HealthReportView"
```

---

### Task 8: Reactive CORS link in upload manager

**Files:**
- Modify: `src/components/browser/upload-manager.tsx`

- [ ] **Step 1: Add `Link` import**

Open `src/components/browser/upload-manager.tsx`. Add `Link` from Next.js at the top of the imports:

```ts
import Link from "next/link";
```

- [ ] **Step 2: Add the "Check permissions" link below the error status label**

The status label paragraph (lines 219–228) renders for every item. Currently it reads:

```tsx
<p
  className={`mt-1 truncate text-xs ${
    item.status === "error"
      ? "text-destructive"
      : "text-muted-foreground"
  }`}
  title={item.status === "error" ? item.error : undefined}
>
  {statusLabel(item)}
</p>
```

Replace with:

```tsx
<p
  className={`mt-1 truncate text-xs ${
    item.status === "error"
      ? "text-destructive"
      : "text-muted-foreground"
  }`}
  title={item.status === "error" ? item.error : undefined}
>
  {statusLabel(item)}
</p>
{item.status === "error" && item.error?.includes("CORS") && (
  <Link
    href={`/app/buckets/${item.connectionId}/${encodeURIComponent(item.bucket)}?tab=permissions`}
    className="mt-0.5 text-xs text-primary underline-offset-2 hover:underline"
  >
    Check permissions →
  </Link>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | head -40
```

Expected: no errors. `connectionId` and `bucket` are already on `UploadItem`.

- [ ] **Step 4: Run all tests**

```bash
pnpm vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/browser/upload-manager.tsx
git commit -m "feat(uploads): add Check permissions link on CORS upload errors"
```

---

## Manual Verification Checklist

After all tasks are committed:

1. Start dev server: `pnpm dev`
2. Open a bucket's Permissions tab and click Refresh — confirm "Direct uploads (CORS)" row appears
3. On a bucket without CORS configured: row shows "Unavailable", expand reveals the denial reason and a Fix button
4. Click Fix — spinner shows, row refreshes to "Available" (or shows permission error if credentials lack `s3:PutBucketCors`)
5. Trigger a CORS upload error (upload to a bucket without CORS) — upload manager shows the error with a "Check permissions →" link
6. Click the link — navigates to the bucket's Permissions tab
