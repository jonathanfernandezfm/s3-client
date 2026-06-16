# Plan 010: Make Stripe and Clerk webhooks idempotent; surface activity-record failures

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 6dbaee9..HEAD -- prisma/schema.prisma src/app/api/webhooks src/lib/db/activity.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M (includes a Prisma migration)
- **Risk**: MED (touches billing webhook + auth webhook; both have customer-visible side effects on misbehavior)
- **Depends on**: [[003-clean-verification-baseline]]
- **Category**: bug + sec
- **Planned at**: commit `6dbaee9`, 2026-06-13

## Why this matters

Three related gaps in the webhook + activity surface:

1. **Stripe webhook is not idempotent.** Stripe retries delivery if the
   handler doesn't 2xx within 5 seconds. The handler at
   `src/app/api/webhooks/stripe/route.ts:26-69` processes each event by
   running an `upsert` or `updateMany`. The `updateMany` paths
   (`customer.subscription.updated`, `customer.subscription.deleted`)
   are idempotent by accident — they set absolute state. The `upsert`
   path (`checkout.session.completed`) is mostly idempotent but can
   silently overwrite a tier change that happened between the original
   delivery and the retry. The handler also calls
   `stripe.subscriptions.retrieve(session.subscription)` on every
   retry, costing rate-budget needlessly.

2. **Clerk webhook is not idempotent and crashes on retries.** At
   `src/app/api/webhooks/clerk/route.ts:50-98` the handler uses
   `prisma.user.create` (not `upsert`) for `user.created` and
   `prisma.user.delete` for `user.deleted`. Svix retries on any
   non-200 response, so a duplicate `user.created` throws a P2002
   unique-constraint error, the response is 500, Svix retries again,
   and the loop continues until Svix gives up. A duplicate
   `user.deleted` throws P2025 (record not found) with the same
   retry-storm consequence.

3. **Activity-recording failures are invisible.** `src/lib/db/activity.ts:37-39,
   60-62, 82-84` empty-catch every prisma error, log to
   `console.error`, and return `Promise<void>`. Callers cannot distinguish
   "recorded" from "lost." A DB outage during a high-traffic period silently
   loses audit events. The "best effort, never fail the user op" semantic
   is correct — but the silence is not. The fix is to return a success
   boolean (or a discriminated union) so the route can at least log
   structured-context info on failure for later monitoring, without
   propagating the failure to the user.

## Current state

### Stripe webhook (`src/app/api/webhooks/stripe/route.ts`)

- Lines 11–24: signature verification (`stripe.webhooks.constructEvent`).
  Correct; do not touch.
- Lines 26–69: switch over `event.type`. Three handled types
  (`checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`) plus a no-op log for
  `invoice.payment_failed`.
- Handler bodies use `buildSubscriptionUpsertFromCheckout`,
  `buildSubscriptionUpdateFromDeleted`,
  `buildSubscriptionUpdateFromUpdated` from `./handler.ts` —
  pure functions; tested in `handler.test.ts`.
- No event-id deduplication anywhere.

### Clerk webhook (`src/app/api/webhooks/clerk/route.ts`)

- Lines 1–37: svix signature verification. Correct.
- Lines 42–69 (`user.created`): `prisma.user.create({…})`. No idempotency,
  no upsert; duplicate event = P2002.
- Lines 72–88 (`user.updated`): `prisma.user.update({where: {clerkId: id}, …})`.
  Throws P2025 if the row doesn't exist (e.g. updated event arrives
  before the created event finishes). The crash here is similar in shape
  to user.created but the failure mode is different.
- Lines 91–98 (`user.deleted`): `prisma.user.delete({where: {clerkId: id}})`.
  P2025 on duplicate.
- The route does NOT log the `svix-id` it processes.

### Activity recording (`src/lib/db/activity.ts`)

- All three exports (`recordActivity`, `recordActivityWithBatch`,
  `recordActivityBatch`) follow the same shape: `try { … }
  catch (err) { console.error("[activity] X failed:", err); }`. Return
  type `Promise<void>`.
- Callers across `src/app/api/objects/*/route.ts` are all
  `await recordActivityBatch(…)` (or single variant). None branch on
  success.

### Prisma migration history

`prisma/migrations/` lists 10 prior migrations under the
`YYYYMMDDHHMMSS_name` convention. The next migration created by this plan
follows the same naming. The most recent is
`20260611000000_add_editor_team_role` (verified at planning).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Generate Prisma | `pnpm prisma generate` | exit 0 |
| Create migration (dev) | `pnpm prisma migrate dev --name add_webhook_events` | new directory under `prisma/migrations/`; lockfile updated; client regenerated |
| Tests | `pnpm test` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope** (the only files you should create or modify):

- `prisma/schema.prisma` — add the `WebhookEvent` model.
- `prisma/migrations/<timestamp>_add_webhook_events/migration.sql` (created by `prisma migrate dev`).
- `src/generated/prisma/**` (regenerated by Prisma — not hand-edited).
- `src/lib/db/webhook-events.ts` (create) — `markWebhookProcessed(source, eventId)` helper.
- `src/lib/db/webhook-events.test.ts` (create).
- `src/lib/db/activity.ts` — change return type from `void` to a discriminated success/failure shape.
- `src/lib/db/activity.test.ts` — extend tests for the new return shape.
- `src/app/api/webhooks/stripe/route.ts` — add dedup gate; log activity-record failures.
- `src/app/api/webhooks/clerk/route.ts` — add dedup gate; switch to upsert/idempotent-delete patterns; log `svix_id` on every handler.
- All routes calling `recordActivity{,Batch,WithBatch}` — add a single log on failure (one-line addition each).
- `plans/README.md` — status row only.

**Out of scope** (do NOT touch):

- Any other webhook surface.
- Activity feed reads.
- A structured-logging dependency (use existing `console.error` with
  context object — improving to a real logger is a separate plan).
- Compensating actions if a webhook is processed but the route handler
  later fails — that's a deeper architectural change.
- Switching to a queue (BullMQ, etc.) for activity recording.
- Removing the broad `recordActivity` empty-catch — the goal is
  observability, not failure propagation.

## Git workflow

- Branch: `fix/webhook-idempotency-and-activity-logging` off `main`.
- Suggested commits:
  - `feat(db): add WebhookEvent model and migration`
  - `feat(webhooks): make Stripe and Clerk handlers idempotent`
  - `feat(activity): return success boolean and log structured failures`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the `WebhookEvent` model

In `prisma/schema.prisma`, after the existing webhook-adjacent models
(after `ConnectionPermissionCheck`, before or near the model list end is
fine; convention in this file is no strict ordering), add:

```prisma
enum WebhookSource {
  STRIPE
  CLERK
}

model WebhookEvent {
  id        String        @id @default(uuid())
  source    WebhookSource
  // The provider-supplied event id (Stripe: event.id; Clerk: svix-id header).
  eventId   String
  // Best-effort metadata for incident debugging; nullable.
  eventType String?

  createdAt DateTime @default(now())

  @@unique([source, eventId])
  @@index([source, createdAt(sort: Desc)])
  @@map("webhook_events")
}
```

The unique constraint is the idempotency mechanism: `prisma.webhookEvent.create`
throws `P2002` on duplicate. The handler converts that into a "skip,
already processed" 200.

Add the timestamp prefix for the migration:

```bash
pnpm prisma migrate dev --name add_webhook_events
```

This:
- Creates `prisma/migrations/<timestamp>_add_webhook_events/migration.sql`.
- Updates the dev DB if `DATABASE_URL` points at one (otherwise reports the
  SQL but doesn't apply it).
- Regenerates `src/generated/prisma/` so `WebhookEvent` and `WebhookSource`
  are usable.

If the executor doesn't have a working dev DB, use:

```bash
pnpm prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > /tmp/migration.sql
```

…and then hand-create the migration directory:
```
prisma/migrations/<UTC-timestamp>_add_webhook_events/migration.sql
```
with the content of `/tmp/migration.sql`. Then run `pnpm prisma generate`
to update types. The CI's `prisma migrate deploy` in production will apply
the migration when the PR ships.

**Verify**: `grep -c "WebhookEvent" src/generated/prisma/enums.ts src/generated/prisma/models.ts 2>/dev/null | head -3` (or whichever generated file Prisma 7 uses for model names — find via `find src/generated/prisma -type f -name "*.ts" | head`) → at least one hit.

### Step 2: Write the `markWebhookProcessed` helper

Create `src/lib/db/webhook-events.ts`:

```ts
import prisma from "./prisma";
import type { WebhookSource } from "@/generated/prisma/client";

const DUPLICATE_KEY_ERROR = "P2002";

export type WebhookCheckResult = "new" | "duplicate";

/**
 * Atomically record that a webhook event is being processed.
 *
 * Returns "new" if this is the first time we've seen (source, eventId),
 * "duplicate" if the row already exists. The caller MUST return 2xx
 * without doing further work when the result is "duplicate" — that's
 * the contract that makes the handler idempotent.
 *
 * The catch only swallows the unique-constraint code; any other DB
 * error is rethrown so the upstream webhook delivery will retry.
 */
export async function markWebhookProcessed(
  source: WebhookSource,
  eventId: string,
  eventType?: string | null
): Promise<WebhookCheckResult> {
  try {
    await prisma.webhookEvent.create({
      data: { source, eventId, eventType: eventType ?? null },
    });
    return "new";
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === DUPLICATE_KEY_ERROR
    ) {
      return "duplicate";
    }
    throw err;
  }
}
```

Tests (`webhook-events.test.ts`), mocking prisma as in
`src/lib/db/activity.test.ts`:

1. First call with `(STRIPE, "evt_1")` → returns `"new"`,
   `prisma.webhookEvent.create` called once.
2. Second call with the same `(STRIPE, "evt_1")` → mock create to throw
   `{ code: "P2002" }`; returns `"duplicate"`.
3. Create throws a different error → rethrown.

**Verify**: `pnpm test src/lib/db/webhook-events.test.ts` → 3 pass.

### Step 3: Wire dedup into the Stripe webhook

In `src/app/api/webhooks/stripe/route.ts`, after the signature
verification block (line 24) and BEFORE the `try { switch (event.type) ...`
block, add:

```ts
import { markWebhookProcessed } from "@/lib/db/webhook-events";
// …

const dedup = await markWebhookProcessed("STRIPE", event.id, event.type);
if (dedup === "duplicate") {
  return NextResponse.json({ received: true, duplicate: true });
}
```

This skips the body for any retry, including any future `stripe.subscriptions.retrieve`
call. The 200 stops Stripe from retrying further.

The default `event.type` field on a Stripe event is always defined.

**Verify**: `grep -n "markWebhookProcessed" src/app/api/webhooks/stripe/route.ts` → 1 match. `pnpm typecheck && pnpm lint` → exit 0.

### Step 4: Wire dedup + idempotent patterns into the Clerk webhook

In `src/app/api/webhooks/clerk/route.ts`:

(a) After the svix verification (current line 37) and BEFORE the
`switch (eventType)`, add:

```ts
import { markWebhookProcessed } from "@/lib/db/webhook-events";
// …

const dedup = await markWebhookProcessed("CLERK", svix_id, eventType);
if (dedup === "duplicate") {
  return new Response("Already processed", { status: 200 });
}
```

(`svix_id` is captured from headers at line 14; reuse that.)

(b) Change the `user.created` handler (lines 42–69) from `prisma.user.create`
to `prisma.user.upsert`. This is defense in depth: even if dedup is
bypassed (clock issues, manual retry), the operation is safe.

```ts
case "user.created": {
  const { id, email_addresses, first_name, last_name, image_url } = evt.data;
  const primaryEmail = email_addresses.find(
    (e) => e.id === evt.data.primary_email_address_id
  );

  await prisma.user.upsert({
    where: { clerkId: id },
    create: {
      clerkId: id,
      email: primaryEmail?.email_address ?? "",
      firstName: first_name,
      lastName: last_name,
      imageUrl: image_url,
      personalWorkspace: { create: { type: "PERSONAL" } },
      subscription: { create: { tier: "FREE" } },
    },
    update: {
      email: primaryEmail?.email_address ?? undefined,
      firstName: first_name,
      lastName: last_name,
      imageUrl: image_url,
    },
  });
  break;
}
```

(c) `user.updated` (lines 72–88): switch to `upsert` for the same reason
— a `user.updated` arriving before the matching `user.created` is rare
but possible:

```ts
case "user.updated": {
  const { id, email_addresses, first_name, last_name, image_url } = evt.data;
  const primaryEmail = email_addresses.find(
    (e) => e.id === evt.data.primary_email_address_id
  );

  await prisma.user.upsert({
    where: { clerkId: id },
    create: {
      clerkId: id,
      email: primaryEmail?.email_address ?? "",
      firstName: first_name,
      lastName: last_name,
      imageUrl: image_url,
      personalWorkspace: { create: { type: "PERSONAL" } },
      subscription: { create: { tier: "FREE" } },
    },
    update: {
      email: primaryEmail?.email_address ?? undefined,
      firstName: first_name,
      lastName: last_name,
      imageUrl: image_url,
    },
  });
  break;
}
```

(d) `user.deleted` (lines 91–98): switch to `deleteMany` (which is a
no-op when nothing matches):

```ts
case "user.deleted": {
  const { id } = evt.data;
  if (id) {
    await prisma.user.deleteMany({ where: { clerkId: id } });
  }
  break;
}
```

`deleteMany` returns `{ count: 0 }` instead of throwing P2025 if the user
is already gone.

(e) Log the svix id on entry for incident-debugging visibility:

After dedup, before the switch:
```ts
console.log("[clerk-webhook]", { svixId: svix_id, eventType });
```

(No PII; just the event type. Improving to a real logger is a separate
plan; the line is `console.log` to match the rest of the codebase.)

**Verify**: `grep -nc "prisma.user.create\\b\\|prisma.user.delete\\b" src/app/api/webhooks/clerk/route.ts` → 0 (replaced by upsert / deleteMany). `pnpm test && pnpm typecheck && pnpm lint` → exit 0.

### Step 5: Change activity recording to return success and log structured context

In `src/lib/db/activity.ts`, change the three exports' return type from
`Promise<void>` to `Promise<{ ok: true } | { ok: false; reason: string }>`.
Replace each `console.error` body with the new return + a structured
log:

```ts
export async function recordActivity(input: SingleActivityInput): Promise<ActivityResult> {
  try {
    await prisma.activityEvent.create({
      data: {
        connectionId: input.connectionId,
        userId: input.userId,
        userDisplayName: input.userDisplayName,
        userImageUrl: input.userImageUrl,
        action: input.action,
        bucket: input.bucket,
        key: input.key,
        targetKey: input.targetKey,
        byteSize: input.byteSize,
        batchId: null,
      },
    });
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[activity] recordActivity failed", {
      connectionId: input.connectionId,
      action: input.action,
      bucket: input.bucket,
      key: input.key,
      userId: input.userId,
      reason,
    });
    return { ok: false, reason };
  }
}

export type ActivityResult = { ok: true } | { ok: false; reason: string };
```

Apply the same shape to `recordActivityWithBatch` and `recordActivityBatch`.

In each calling route (`grep -rln "recordActivity\\b\\|recordActivityBatch\\b\\|recordActivityWithBatch\\b" src/app/api`),
add a one-line `if (!result.ok)` guard that does NOT change the response,
just adds context. Example for `delete/route.ts`:

```ts
const activityResult = await recordActivityBatch({
  connectionId,
  userId: user.id,
  userDisplayName: …,
  userImageUrl: user.imageUrl ?? null,
  action: "DELETE",
  bucket,
  items: keys.map((k) => ({ key: k })),
});
if (!activityResult.ok) {
  console.error("[activity] delete-route lost audit row", {
    connectionId,
    keys: keys.length,
    reason: activityResult.reason,
  });
}
```

Behavior is unchanged for the user; observability is restored. (When the
team adopts a real logger, the two `console.error` sites collapse to one
structured event with stable context.)

Tests (`activity.test.ts`): extend with cases for:
- Happy path → `{ ok: true }`.
- Mocked prisma throws → `{ ok: false, reason: <string> }` and the
  catch still ran (no rejection propagates).

**Verify**:
- `pnpm test src/lib/db/activity.test.ts` passes including the new cases.
- `grep -rn "recordActivityBatch\\|recordActivity\\b\\|recordActivityWithBatch\\b" src/app/api --include="*.ts" | wc -l` matches the pre-existing call count (each remains, just with a `const` assignment in front).

### Step 6: Composite gate

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm build
```

Expected: exit 0.

### Step 7: Smoke walks

`pnpm dev` with Stripe and Clerk webhook routing to your local instance
(use `stripe trigger` or the Clerk dashboard's test event):

1. Trigger a `checkout.session.completed` event twice in quick
   succession. Confirm:
   - The first call returns 200 with `received: true`.
   - The second call returns 200 with `received: true, duplicate: true`.
   - The DB only ran the upsert once (check `subscriptions` table
     `updatedAt`).
2. Trigger a `user.created` event twice. Confirm same idempotency.
3. Manually `console.log` a fake `recordActivity` error path (or break
   the DB connection briefly) and verify the structured log includes
   `connectionId, action, bucket`.

## Test plan

New unit tests added in this plan:
- `src/lib/db/webhook-events.test.ts` — 3 cases.
- `src/lib/db/activity.test.ts` — 3+ new cases for the discriminated return.

Webhook routes themselves have no harness (route tests come in plan 007's
follow-ups for non-webhook routes; the webhook routes use the existing
helper-test pattern in `stripe/handler.test.ts`).

## Done criteria

ALL must hold:

- [ ] `prisma/migrations/<timestamp>_add_webhook_events/migration.sql` exists with `CREATE TABLE webhook_events …` and a unique index on `(source, "eventId")`.
- [ ] `src/generated/prisma/` regenerated to include `WebhookEvent` and `WebhookSource`.
- [ ] `src/lib/db/webhook-events.ts` exports `markWebhookProcessed` with 3 unit tests passing.
- [ ] `pnpm test && pnpm typecheck && pnpm lint && pnpm build` exit 0.
- [ ] `grep -nc "prisma.user.create\\b\\|prisma.user.delete\\b" src/app/api/webhooks/clerk/route.ts` → 0.
- [ ] `grep -nc "markWebhookProcessed" src/app/api/webhooks` → 2.
- [ ] `recordActivity{,Batch,WithBatch}` return types updated; all callers in `src/app/api` log the failure result via `console.error` with structured context.
- [ ] Smoke walks in Step 7 confirm duplicate webhook events return 200 without re-doing work.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- `pnpm prisma migrate dev` requires an interactive prompt (it can ask
  about data loss on rare schema patterns). Run with `--accept-data-loss`
  ONLY if the diff truly shows no data-loss; otherwise STOP.
- The `prisma.webhookEvent.create` returns an error code other than
  `P2002` for a duplicate — the helper's catch logic depends on `P2002`.
  Read the actual error code from your Postgres version and adjust if
  needed (some Prisma releases have remapped codes).
- A route handler depends on `recordActivity*` throwing (it shouldn't —
  it never threw — but verify). If any caller does `await recordActivity({…}).catch(…)`,
  it can keep that wrapper; the new return shape is opt-in.
- The Clerk `user.updated` event ordering issue (an update arriving
  before the corresponding create) turns out to be impossible in practice
  per Clerk docs at planning time — the upsert defense in Step 4(c) is
  harmless extra safety regardless. Don't remove it.

## Maintenance notes

- The `WebhookEvent` table grows monotonically. Add a cleanup migration
  in a future plan to delete rows older than ~30 days (Stripe's retry
  window is hours; Clerk's is days; 30 days is conservative).
- When the team picks a structured logger (pino, winston, or the
  Vercel Log Drain), the `console.error("[activity] …", { context })`
  shape translates 1:1 — that's intentional.
- Stripe also offers idempotency keys for outbound API calls; this plan
  only addresses INBOUND webhook idempotency. Outbound calls
  (`stripe.subscriptions.retrieve(…)`) are read-only and don't need
  idempotency.
- Reviewer focus: confirm the `WebhookEvent` row is created BEFORE any
  business logic in each handler. A bug where the row is created AFTER
  upserts would let a partial-success retry re-run only the early steps
  — worse than today's state.
