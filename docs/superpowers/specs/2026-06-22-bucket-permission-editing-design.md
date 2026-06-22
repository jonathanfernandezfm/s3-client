# Bucket Permission Editing Design

**Date:** 2026-06-22
**Scope:** Design spike specifying how to add write-side bucket permission controls to S3 Client — specifically Public Access Block toggling and bucket-policy display/editing — covering the threat model, v1 slice decision, route shapes, provider compatibility, and confirmation UX. No code is produced here; this spec gates any subsequent build plan.

---

## Goal

The app can detect a bucket's effective security posture (health probes) and, once Plan 023 lands, display a `BucketSecurityPosture` summary card. However, it cannot change any S3 permission. The natural next user request — "lock this bucket down," "make this prefix public," "view the raw bucket policy" — is valuable bucket administration that is also the most dangerous category of mutation this product could ship.

A one-click "make public" button is a data-exposure footgun. Public Access Block silently overrides bucket policies on AWS without an error. S3-compatible providers (MinIO, Cloudflare R2, Backblaze B2) disagree on which permission APIs exist. This spike exists to answer, before any code is written: what is safe to ship in v1, what confirmation UX is required, and what must be deferred?

---

## Threat model

### 1. Exposure footgun — public mutations are irreversible exposure windows

Setting a bucket or object public is irreversible in practice: data may be scraped, cached by search engines, or indexed by cloud-storage scanners within seconds of becoming public. Undoing the action does not recall data that was already fetched. Every action that widens access (turning PAB off, adding a public `s3:GetObject` policy, setting `public-read` ACL) must require a destructive-action confirmation dialog with:

- An explicit warning: "This will make data publicly readable on the internet. Scrapers and search engines may index it immediately. This cannot be fully undone."
- Type-the-bucket-name-to-confirm input (same pattern as `DeleteBucketDialog` in `src/components/buckets/delete-bucket-dialog.tsx`, which uses a `DialogContent` + `DialogDescription` + confirm button disabled until precondition met). The confirm button must remain disabled until the typed name matches exactly.
- Destructive button labelled "Make public" (not "Save" or "Apply") so the severity is clear in the button label itself.

Narrowing actions (turning PAB ON, deleting a public policy) require only a standard "Are you sure?" confirmation — no type-to-confirm, because the action reduces exposure.

### 2. Privilege — ADMIN-only, server-enforced

All permission write routes must gate on `access.role !== "ADMIN"` and return `403`, exactly as `apply-cors/route.ts` and the versioning PUT do. This check is **server-side only** — the client may hide controls for non-ADMINs as a UX courtesy, but the gate lives in the route handler. EDITOR is not allowed to mutate permissions; the reasoning is that permissions are a security control plane, not content management, and the distinction between "can write objects" (EDITOR) and "can change who can access objects" (ADMIN) is material. VIEWER is read-only.

Summary: ADMIN may read + write permission settings. EDITOR and VIEWER may read (view the posture card from Plan 023) but not write.

### 3. Auditability — every mutation writes a `recordActivity` entry

Every permission write route must call `recordActivity` after a successful S3 mutation, following the same pattern as the versioning PUT route (`src/app/api/buckets/[bucket]/versioning/route.ts`). The activity entry must include: `connectionId`, `userId`, `userDisplayName`, `userImageUrl`, `action` (e.g., `"enabled-public-access-block"`, `"disabled-public-access-block"`, `"put-bucket-policy"`, `"deleted-bucket-policy"`), and `bucket`. Permission changes are exactly the category of mutation that requires an audit trail — if something goes wrong (data exposed, access lost), the activity log is the first thing that gets reviewed.

### 4. Blast radius — raw policy JSON editor

Editing a raw bucket policy JSON is the highest-risk operation in this surface:

- A malformed policy locks the bucket owner out (AWS evaluates a malformed policy as "deny all").
- An overly broad `"Principal": "*"` opens the bucket wider than intended.
- A missing `"Action"` or wrong `"Resource"` ARN silently has no effect, giving false confidence.

Recommendation: v1 ships **no raw policy editor**. Display the current raw policy JSON as read-only (syntax-highlighted, non-editable). If a free-form JSON editor is added in a future version, it must (a) parse and validate JSON before enabling the submit button, (b) show a diff of the current vs. proposed policy, and (c) display a "You may lose access to this bucket if the policy is incorrect" warning. The guarded, templated path — a "make prefix public / private" toggle that generates a minimal policy internally — is the safe v1 write.

### 5. Public Access Block precedence trap

AWS S3 applies Public Access Block at both the account level and the bucket level. When any PAB flag is enabled, it overrides bucket policies and ACLs silently — a `PutBucketPolicy` call granting `s3:GetObject` to `"Principal": "*"` will succeed (return HTTP 200) but have no effect while `BlockPublicPolicy` or `RestrictPublicBuckets` is ON. The user sees no error and may believe the bucket is now public when it is not.

The UI must detect this condition using Plan 023's `BucketSecurityPosture` signals: if `publicAccessBlock.blockPublicPolicy === true` or `publicAccessBlock.restrictPublicBuckets === true`, and the user attempts any widening action, show an inline warning: "Public Access Block is active on this bucket. This policy change will have no effect until PAB is disabled. Disable PAB first, then apply the policy." Do not silently apply; surface the override.

### 6. Misuse vector — not a new attack surface against third parties

This feature only ever operates with credentials the user already provided for their own connection. It grants no access the user does not already have to any bucket. The footgun risk is entirely self-directed: a user with valid `s3:PutBucketPublicAccessBlock` credentials can already do this from the AWS console or CLI. The app is a convenience surface, not a privilege escalation. This should be stated explicitly in code review so reviewers do not over-rotate on "this lets users make buckets public" — they already can.

---

## Changes

### Prerequisite: Plan 023 — `src/lib/s3/security-posture.ts`

This spec depends on the read half from Plan 023, which introduces `BucketSecurityPosture` and its `GET /api/connections/[id]/buckets/[bucket]/security-posture` route. **That branch is not yet merged** (as of 2026-06-22). The permission editing UI must read the current posture from that route before rendering any write controls — it uses the `publicAccessBlock` and `policy` signals to decide which controls to enable or warn about. The build plan that follows this spec must list Plan 023 as a hard prerequisite.

Plan 023's types (inlined for reference):

```ts
export type SignalState = "ok" | "not-configured" | "unsupported" | "denied" | "error";

export interface BucketSecurityPosture {
  publicAccessBlock: {
    state: SignalState;
    blockPublicAcls?: boolean;
    ignorePublicAcls?: boolean;
    blockPublicPolicy?: boolean;
    restrictPublicBuckets?: boolean;
    fullyBlocked?: boolean;
  };
  policy: { state: SignalState; isPublic?: boolean };
  encryption: { state: SignalState; algorithm?: string | null };
  warnPublic: boolean; // true only when policy.state === "ok" && policy.isPublic === true
}
```

`classifyPostureError(err, notConfiguredName)` maps S3 errors to `not-configured | unsupported | denied | error` — reuse this in the new write routes for consistent error handling.

---

### 1. New route: `PUT /api/connections/[id]/buckets/[bucket]/public-access-block`

File: `src/app/api/connections/[id]/buckets/[bucket]/public-access-block/route.ts`

This is the v1 write surface. It follows the apply-cors pattern exactly: `withAuth` + ADMIN gate + S3 call + `AccessDenied` → 400 + `recordActivity` + re-run security-posture read.

```ts
import { NextResponse } from "next/server";
import {
  GetPublicAccessBlockCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";
import { withAuth } from "@/lib/auth";
import { getConnectionAccessById } from "@/lib/db/connections";
import { createS3Client } from "@/lib/s3/client";
import { recordActivity } from "@/lib/db/activity";
// re-run security-posture check after mutation (import once Plan 023 is merged)

type RouteContext = { params: Promise<{ id: string; bucket: string }> };

// GET — returns current PAB config; reads from security-posture (Plan 023 route)
// exposed for the UI to refresh state without a full posture re-run

export const PUT = withAuth<RouteContext>(async (req, { user, params }) => {
  const { id, bucket } = await params;

  const access = await getConnectionAccessById(id, user.id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (access.role !== "ADMIN") {
    return NextResponse.json(
      { error: "You do not have permission to update Public Access Block settings" },
      { status: 403 },
    );
  }

  const { blockPublicAcls, ignorePublicAcls, blockPublicPolicy, restrictPublicBuckets }:
    { blockPublicAcls: boolean; ignorePublicAcls: boolean; blockPublicPolicy: boolean; restrictPublicBuckets: boolean } =
    await req.json();

  const client = createS3Client(access.connection);

  try {
    await client.send(
      new PutPublicAccessBlockCommand({
        Bucket: bucket,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: blockPublicAcls,
          IgnorePublicAcls: ignorePublicAcls,
          BlockPublicPolicy: blockPublicPolicy,
          RestrictPublicBuckets: restrictPublicBuckets,
        },
      }),
    );
  } catch (err) {
    const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
    const name = e.name ?? e.Code ?? "";
    const status = e.$metadata?.httpStatusCode;
    if (name === "AccessDenied" || status === 403) {
      return NextResponse.json(
        { error: "These credentials don't have permission to update Public Access Block. Apply the setting manually via the AWS console or your provider's console." },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const isEnabling = blockPublicAcls && ignorePublicAcls && blockPublicPolicy && restrictPublicBuckets;
  await recordActivity({
    connectionId: id,
    userId: user.id,
    userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
    userImageUrl: user.imageUrl ?? null,
    action: isEnabling ? "enabled-public-access-block" : "updated-public-access-block",
    bucket,
  });

  // Re-run security-posture check (non-fatal, like apply-cors re-runs health check)
  // try { await runSecurityPostureCheck(id, bucket); } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true });
});
```

SDK commands used: `GetPublicAccessBlockCommand` (for GET endpoint, optional), `PutPublicAccessBlockCommand`. Both are confirmed exported as `function` from `@aws-sdk/client-s3` (reviewer pre-verified: `node -e "..."` prints `function function function function function`).

---

### 2. New route: `GET /api/connections/[id]/buckets/[bucket]/bucket-policy`

File: `src/app/api/connections/[id]/buckets/[bucket]/bucket-policy/route.ts`

V1 is **read-only display** of the raw policy JSON. No write in v1.

```ts
import { NextResponse } from "next/server";
import { GetBucketPolicyCommand } from "@aws-sdk/client-s3";
import { withAuth } from "@/lib/auth";
import { getConnectionAccessById } from "@/lib/db/connections";
import { createS3Client } from "@/lib/s3/client";
import { classifyPostureError } from "@/lib/s3/security-posture"; // Plan 023

type RouteContext = { params: Promise<{ id: string; bucket: string }> };

export const GET = withAuth<RouteContext>(async (_req, { user, params }) => {
  const { id, bucket } = await params;

  const access = await getConnectionAccessById(id, user.id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Any role may read; VIEWER sees the policy JSON too

  const client = createS3Client(access.connection);
  try {
    const { Policy } = await client.send(new GetBucketPolicyCommand({ Bucket: bucket }));
    return NextResponse.json({ policy: Policy ?? null });
  } catch (err) {
    const state = classifyPostureError(err, "NoSuchBucketPolicy");
    if (state === "not-configured") return NextResponse.json({ policy: null });
    if (state === "unsupported") return NextResponse.json({ policy: null, unsupported: true });
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
```

SDK commands: `GetBucketPolicyCommand` — confirmed exported as `function` (reviewer pre-verified).

The POST/PUT/DELETE side of `/bucket-policy` (for a templated prefix-policy writer or raw-JSON editor) is deferred to v2 (see Out of Scope).

---

### 3. UI surface — new "Access" sub-section in the Permissions tab

The existing Permissions tab (`src/components/buckets/permissions-tab.tsx`, introduced in the permissions-tab spec `2026-06-06-permissions-tab-design.md`) houses the health report. The permission editing controls live below the health report as a new `<BucketAccessPanel>` section within the same tab — no new tab needed.

Layout within the Permissions tab:
```
[Health Report — existing HealthReportView]
─────────────────────────────────────────
[Access Settings — new BucketAccessPanel]
  Public Access Block
    [4 toggle controls, ADMIN-only; read-only for EDITOR/VIEWER]
    [PAB override warning banner when applicable]
  Bucket Policy
    [Read-only JSON display, syntax-highlighted, copy button]
    [v2 deferred: "Edit policy" action]
```

New file: `src/components/buckets/bucket-access-panel.tsx`

- Reads `BucketSecurityPosture` from Plan 023's query hook (e.g., `useSecurityPosture(connectionId, bucket)`).
- For PAB: renders four checkboxes (BlockPublicAcls, IgnorePublicAcls, BlockPublicPolicy, RestrictPublicBuckets). For ADMIN: checkboxes are interactive, triggering the confirmation dialog on any widening change. For EDITOR/VIEWER: checkboxes are visually rendered but `disabled` with a tooltip "Only admins can change access settings."
- For policy: renders a `<pre>` / code block with the JSON from the `/bucket-policy` GET route. Shows "No bucket policy configured" when `policy: null`. Shows "Policy display not supported by this provider" when `unsupported: true`.
- When Plan 023's `publicAccessBlock.state === "unsupported"`: renders a "Public Access Block is not supported by this provider" notice and hides the PAB controls.

---

### 4. Confirmation dialog: `src/components/buckets/public-access-confirm-dialog.tsx`

For any **widening** change (any PAB flag being turned OFF, or a future policy becoming public):

```tsx
// Widening action — requires type-to-confirm
<Dialog>
  <DialogHeader>
    <DialogTitle>Disable Public Access Block</DialogTitle>
    <DialogDescription>
      This will allow public bucket policies and ACLs on <strong>{bucket}</strong>.
      Data may become publicly readable on the internet. Scrapers and search engines
      may index it immediately. This cannot be fully undone.
    </DialogDescription>
  </DialogHeader>
  <div>
    <Label>Type the bucket name to confirm:</Label>
    <Input value={typed} onChange={...} placeholder={bucket} />
  </div>
  <DialogFooter>
    <Button variant="outline" onClick={onCancel}>Cancel</Button>
    <Button variant="destructive" disabled={typed !== bucket} onClick={onConfirm}>
      Disable Public Access Block
    </Button>
  </DialogFooter>
</Dialog>
```

For **narrowing** changes (any PAB flag being turned ON):

Standard `AlertDialog` with "Are you sure?" — no type-to-confirm required.

---

### 5. React Query hooks and query keys

Add to `src/lib/queries/keys.ts`:
```ts
publicAccessBlock: (connectionId: string, bucket: string) =>
  ["connections", connectionId, "buckets", bucket, "public-access-block"] as const,
bucketPolicy: (connectionId: string, bucket: string) =>
  ["connections", connectionId, "buckets", bucket, "bucket-policy"] as const,
```

New hooks in `src/lib/queries/security.ts` (or alongside the Plan 023 posture hook):
```ts
export function useBucketPolicy(connectionId: string, bucket: string) {
  return useQuery({
    queryKey: keys.bucketPolicy(connectionId, bucket),
    queryFn: () => fetch(`/api/connections/${connectionId}/buckets/${encodeURIComponent(bucket)}/bucket-policy`).then(r => r.json()),
    staleTime: 60_000,
  });
}

export function useUpdatePublicAccessBlock(connectionId: string, bucket: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: PABConfig) =>
      fetch(`/api/connections/${connectionId}/buckets/${encodeURIComponent(bucket)}/public-access-block`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.securityPosture(connectionId, bucket) });
      queryClient.invalidateQueries({ queryKey: keys.publicAccessBlock(connectionId, bucket) });
    },
  });
}
```

---

## Data Flow

```
User opens Permissions tab
  → PermissionsTab renders HealthReportView (existing)
  → PermissionsTab renders BucketAccessPanel (new)

BucketAccessPanel mounts
  → useSecurityPosture(connectionId, bucket)  [Plan 023 hook]
    GET /api/connections/[id]/buckets/[bucket]/security-posture
    → returns BucketSecurityPosture { publicAccessBlock, policy, ... }
  → useBucketPolicy(connectionId, bucket)
    GET /api/connections/[id]/buckets/[bucket]/bucket-policy
    → returns { policy: string | null, unsupported?: true }

ADMIN clicks PAB toggle (widening change)
  → PublicAccessConfirmDialog opens (type-to-confirm)
  → User types bucket name, clicks "Disable Public Access Block"
  → useUpdatePublicAccessBlock.mutate(newConfig)
    PUT /api/connections/[id]/buckets/[bucket]/public-access-block
    → withAuth → ADMIN gate → PutPublicAccessBlockCommand
    → recordActivity("updated-public-access-block", bucket)
    → re-run security-posture check (non-fatal)
    → { ok: true }
  → invalidate securityPosture + publicAccessBlock queries
  → BucketAccessPanel re-renders with updated PAB state

EDITOR/VIEWER views tab
  → PAB checkboxes rendered disabled
  → Policy JSON rendered read-only
  → No mutation controls shown
```

---

## Error States

| Scenario | Route response | User sees |
|---|---|---|
| Provider does not support PAB (e.g., Backblaze B2) | Plan 023 returns `publicAccessBlock.state = "unsupported"` | "Public Access Block is not supported by this provider" notice; PAB controls hidden |
| `AccessDenied` on PAB write | `PUT` returns `{ error: "..." }` status 400 | Inline error: "These credentials don't have permission to update Public Access Block. Apply the setting manually via the console." |
| PAB is ON, user applies a public policy (v2) | Client-side check before submit | Warning banner: "Public Access Block is active. This policy change will have no effect until PAB is disabled." |
| `GetBucketPolicyCommand` — no policy exists | `NoSuchBucketPolicy` → `{ policy: null }` | "No bucket policy configured on this bucket." |
| `GetBucketPolicyCommand` — provider doesn't support | `classifyPostureError` returns `"unsupported"` → `{ policy: null, unsupported: true }` | "Bucket policy is not supported by this provider." |
| `PutPublicAccessBlockCommand` — malformed request body | Route returns 400 validation error | Toast / inline error message |
| Non-ADMIN attempts PAB write | Route returns 403 | Toast: "You do not have permission to update access settings." |
| PAB write succeeds but security-posture re-run fails | Re-run error swallowed (non-fatal); posture stale | Stale posture shown until user refreshes; health re-run is background |

---

## Provider compatibility

| Feature | AWS S3 | MinIO | Cloudflare R2 | Backblaze B2 |
|---|---|---|---|---|
| `PutPublicAccessBlockCommand` | Yes (source: [AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutPublicAccessBlock.html)) | Yes (source: [MinIO docs — S3 API compatibility](https://min.io/docs/minio/linux/reference/s3-api-compatibility.html)) | No — R2 does not implement PAB (source: [Cloudflare R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/)) | No — B2 does not support PAB (unverified; B2's S3-compatible API omits many ACL/policy APIs) |
| `GetBucketPolicyCommand` / `PutBucketPolicyCommand` | Yes | Yes | Yes (source: [Cloudflare R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/)) | Partial — B2 supports some policy operations (unverified) |
| `DeleteBucketPolicyCommand` | Yes | Yes | Yes | Unverified |
| `PutObjectAclCommand` | Conditional — disabled when Object Ownership = "Bucket owner enforced" (source: [AWS Object Ownership docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html)); returns `InvalidBucketAclWithObjectOwnership` error | Yes | No — R2 ACLs are applied via bucket-level public access, not per-object ACL commands (unverified) | No — B2 does not support S3 ACL API (unverified) |
| Account-level PAB (overrides bucket PAB) | Yes (AWS only — account level via Organizations/S3 console) | No | No | No |
| Bucket ACLs (`PutBucketAcl`) | Deprecated on new buckets with Object Ownership enforced | Yes | No (unverified) | No (unverified) |

**Notes on ACL deprecation (AWS):** Since April 2023, new S3 buckets default to `Object Ownership = Bucket owner enforced`, which disables ACLs entirely. Calling `PutObjectAclCommand` on such a bucket returns `InvalidBucketAclWithObjectOwnership`. The UI must detect this via Plan 023's `publicAccessBlock` signals or a separate capability probe and disable the ACL toggle with an explanation. This is a strong argument against shipping `PutObjectAclCommand` in v1 at all — it is both deprecated and provider-specific.

**Unverified cells:** B2 rows are marked "unverified" — the build plan should include a manual test against a live B2 endpoint before shipping any B2-specific UI branches.

---

## Open questions

| Question | Recommended answer |
|---|---|
| Should EDITOR be allowed to write permission settings? | No. Permissions are a security control plane. EDITOR can manage objects (content); ADMIN manages who can access them. Mixing these is a privilege confusion risk. |
| Should permission editing be tier-gated (FREE vs PRO)? | No tier gate for v1. PAB toggle is purely protective (turning PAB on reduces risk), and the read-only policy display is informational. Tier gating makes sense for features that increase value; security controls should not be paywalled. Re-evaluate if policy editing (v2) is added — the blast-radius risk of raw-policy editing may justify restricting it to PRO as a proxy for "more sophisticated user." |
| Where in the UI does the editing surface live — Permissions tab or a new "Access" tab? | Permissions tab, as a new `BucketAccessPanel` section below the existing health report. The bucket detail page spec (`2026-06-05-bucket-detail-page-design.md`) already defines the Permissions tab as the home for "bucket policy and public access block settings." Adding a new tab would fragment the security surface. |
| Does the PAB PUT route need to read the existing config first (read-merge-write) or accept the full 4-flag config? | Accept the full 4-flag config (all four booleans required). Unlike CORS rules (where existing rules must be preserved), PAB is a flat 4-flag struct — there is nothing to merge. The client sends all four flags explicitly, pre-populated from the posture read. |
| Should the security-posture re-run after PAB mutation use the same `runBucketHealthCheck` mechanism or a separate `runSecurityPostureCheck`? | Separate. Health check is a multi-probe test suite; security posture is a targeted read of PAB + policy + encryption. Plan 023 should expose a `runSecurityPostureCheck(connectionId, bucket)` helper analogous to `runBucketHealthCheck`. If Plan 023 does not expose one, the route can invalidate by re-fetching the posture GET; worst case the posture stale-time (60s) is acceptable for a background re-run. |
| What happens if the account-level AWS PAB (outside the bucket) is blocking — should the UI detect this? | Detect if possible, but do not block on it. Account-level PAB can only be read with `s3:GetAccountPublicAccessBlock` on `arn:aws:s3:::*`, which most IAM keys lack. If the API call fails (AccessDenied), treat as "unknown." Show a general notice: "Account-level Public Access Block may also be active. Check your AWS account settings." This is an open question for the build plan. |
| Should the raw bucket policy GET be any-role readable, or ADMIN-only? | Any role (ADMIN/EDITOR/VIEWER). Policy display is informational. A VIEWER who can list objects can already infer something about public access. Hiding the policy from EDITORs creates confusion without improving security. The write side remains ADMIN-only. |

---

## Out of Scope

The following are explicitly deferred to v2 or later; do not include in the build plan that follows this spec:

- **Raw bucket policy JSON editor** (write side) — too high blast radius for v1. Display-only in v1.
- **Templated "make prefix public / private" bucket policy generator** — the safer widening action, but deferred to v2 because it requires the confirmation UX and PAB-override detection to be battle-tested first.
- **`PutObjectAclCommand` / per-object `public-read` toggle** — deprecated on AWS for new buckets; poor provider support; v2 or later only.
- **`PutBucketAclCommand` / bucket-level ACL editing** — deprecated on AWS; not supported by R2/B2; out of scope.
- **Account-level Public Access Block** — requires `s3:GetAccountPublicAccessBlock` / `s3:PutAccountPublicAccessBlock` on `arn:aws:s3:::*`; separate IAM action; deferred.
- **Cross-account bucket policy grants** — complex IAM; out of scope for this product.
- **ACL grants to specific canonical user IDs** — legacy AWS feature; out of scope.
- **Bucket ownership controls / Object Ownership setting** — `PutBucketOwnershipControls`; impacts ACL behavior; deferred.
- **Replication policy / lifecycle rules with permission implications** — covered by separate specs (lifecycle: `2026-06-22-lifecycle-rules-design.md`).
- **Encryption key rotation or KMS policy editing** — out of scope; requires KMS integration.
- **Any UI for providers where the capability is "unsupported"** — the UI disables and explains; no workaround shims.
