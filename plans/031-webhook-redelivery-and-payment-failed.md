# Plan 031: Stop dropping webhook events on handler failure; record `invoice.payment_failed`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5f963f5..HEAD -- src/app/api/webhooks src/lib/db/webhook-events.ts`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (independent of plan 030; can land in either order)
- **Category**: bug
- **Planned at**: commit `5f963f5`, 2026-06-23

## Why this matters

The Stripe and Clerk webhook handlers record the idempotency row **before**
running the handler, then return 500 if the handler throws. Because the
idempotency row is already committed, the provider's retry is treated as a
duplicate and skipped — so a transient failure (DB blip, lock timeout,
momentary inconsistency) **permanently drops the event**. Concretely: a
`checkout.session.completed` that fails once leaves a paying user stuck on the
FREE tier forever; a Clerk `user.created` that fails once means the user record
is never created. The fix is small: if the handler fails, delete the
idempotency row before returning the error, so the provider's next delivery
re-processes. The handlers are already idempotent (upserts / `updateMany` keyed
on stable ids), so re-processing is safe.

Separately, `invoice.payment_failed` is currently only `console.warn`-ed with
no durable record, so a failed renewal is invisible to operators until the
eventual `customer.subscription.deleted`. This plan adds a structured,
queryable log line carrying the affected `userId` (looked up from the Stripe
customer id) — observability only, no subscription-state change (Stripe owns
that).

## Current state

The idempotency helper:

- `src/lib/db/webhook-events.ts` — `markWebhookProcessed(source, eventId, eventType)`
  creates a `WebhookEvent` row and returns `"new"`, or returns `"duplicate"`
  when the unique `(source, eventId)` row already exists (catches Prisma
  `P2002`). Its doc comment states the caller "MUST return 2xx without doing
  further work when the result is `duplicate`". There is **no** delete/rollback
  helper today.
- Schema `prisma/schema.prisma:463-476`:
  ```prisma
  model WebhookEvent {
    id        String        @id @default(uuid())
    source    WebhookSource
    eventId   String
    eventType String?
    createdAt DateTime @default(now())
    @@unique([source, eventId])
    @@index([source, createdAt(sort: Desc)])
    @@map("webhook_events")
  }
  ```
  (Note: the row already has `createdAt` — do not add it.)

Stripe route — records first, then processes, 500 on throw:

- `src/app/api/webhooks/stripe/route.ts:27-30` marks processed:
  ```ts
  const dedup = await markWebhookProcessed("STRIPE", event.id, event.type);
  if (dedup === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true });
  }
  ```
- Lines 32-79: a `try { switch (event.type) { ... } } catch (err) { ... return ... 500 }`.
  The `invoice.payment_failed` case is lines 71-74:
  ```ts
  case "invoice.payment_failed": {
    console.warn("Stripe invoice.payment_failed", event.data.object);
    break;
  }
  ```
- `event.id` is the value passed to `markWebhookProcessed`; it is the key you
  must delete on failure.

Clerk route — records first, then a switch that is **not** wrapped in
try/catch (an exception propagates and Next returns 500):

- `src/app/api/webhooks/clerk/route.ts:42-45` marks processed (uses `svix_id` as
  the event id):
  ```ts
  const dedup = await markWebhookProcessed("CLERK", svix_id, eventType);
  if (dedup === "duplicate") {
    return new Response("Already processed", { status: 200 });
  }
  ```
- Lines 49-130: `switch (eventType) { case "user.created"/"user.updated": upsert; case "user.deleted": deleteMany }` — no surrounding try/catch.
- Returns `new Response("Webhook processed", { status: 200 })` at line 132.

Stripe subscription mapping helpers (pure, already unit-tested) live in
`src/app/api/webhooks/stripe/handler.ts`; their tests are in
`handler.test.ts`. The `Subscription` model
(`prisma/schema.prisma:105-126`) has a unique `stripeCustomerId` — that is how
you map an invoice's customer back to a `userId`.

Test conventions: webhook logic is unit-tested at the **pure-function** layer
(`handler.test.ts` imports plain mappers and asserts their output with cast
fixtures `as never`). There is **no** existing route-level integration test for
the webhook routes (they call Prisma + Stripe SDK directly). Follow the existing
pure-function style: extract the new logic into testable pure functions and test
those, rather than trying to spin up the route.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Run webhook tests | `pnpm test -- src/app/api/webhooks src/lib/db/webhook-events` | all pass |
| Full suite | `pnpm test` | all pass (≥ 670, plus your new tests) |
| Prisma client (only if schema touched — it must NOT be) | `pnpm prisma generate` | n/a — see Scope |

## Scope

**In scope** (the only files you should modify or create):
- `src/lib/db/webhook-events.ts` — add a delete helper.
- `src/lib/db/webhook-events.test.ts` (create, if not present) — unit-test the
  new helper with a mocked Prisma.
- `src/app/api/webhooks/stripe/route.ts` — call the delete helper on failure;
  record `invoice.payment_failed`.
- `src/app/api/webhooks/clerk/route.ts` — wrap the switch, call the delete
  helper on failure.
- `src/app/api/webhooks/stripe/handler.ts` — add a pure
  `buildPaymentFailedLog(invoice, userId)` (or similar) helper.
- `src/app/api/webhooks/stripe/handler.test.ts` — test the new helper.

**Out of scope** (do NOT touch):
- `prisma/schema.prisma` — no schema change is needed (`WebhookEvent` already
  has everything). Do NOT add columns or run a migration.
- The subscription-state logic for `invoice.payment_failed` — do NOT change
  tiers or cancel subscriptions here. Stripe's dunning + the existing
  `customer.subscription.deleted` handler own state. This step is logging only.
- Any retry/backoff wrapper around the Stripe SDK — `stripe-node` already
  retries idempotently; out of scope.

## Git workflow

- Shared checkout — run `git branch --show-current` before committing.
- Branch: `fix/031-webhook-redelivery`.
- Commit style conventional, e.g.
  `fix: re-deliver webhook events when the handler fails` and
  `feat: record stripe invoice.payment_failed for observability`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add a `forgetWebhookEvent` helper

In `src/lib/db/webhook-events.ts`, add an exported async function that deletes
the idempotency row so a retry will be treated as new. Use `deleteMany` (no
throw if the row is already gone) and swallow/log errors so a delete failure
never masks the original handler error:

```ts
/**
 * Remove the idempotency row for (source, eventId) so the next delivery of the
 * same event is processed again. Call this ONLY after the handler failed and
 * you are about to return a non-2xx — it converts "permanently dropped" into
 * "retried". Safe to call when the row is already gone.
 */
export async function forgetWebhookEvent(
  source: WebhookSource,
  eventId: string
): Promise<void> {
  try {
    await prisma.webhookEvent.deleteMany({ where: { source, eventId } });
  } catch (err) {
    console.error("[webhook] failed to roll back idempotency row", {
      source,
      eventId,
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Unit-test `forgetWebhookEvent`

Create `src/lib/db/webhook-events.test.ts` (if absent). Mock `./prisma` the way
other db tests do (`vi.mock("@/lib/db/prisma", ...)` or `./prisma`) and assert:

1. `forgetWebhookEvent("STRIPE", "evt_1")` calls
   `prisma.webhookEvent.deleteMany` with `{ where: { source: "STRIPE", eventId: "evt_1" } }`.
2. If `deleteMany` rejects, `forgetWebhookEvent` still resolves (does not throw)
   and logs.

Also add (or keep) a test for `markWebhookProcessed` returning `"duplicate"` on
a `P2002` error and `"new"` on success, if not already covered elsewhere.

**Verify**: `pnpm test -- src/lib/db/webhook-events` → all pass.

### Step 3: Roll back on failure in the Stripe route

In `src/app/api/webhooks/stripe/route.ts`, import `forgetWebhookEvent` and call
it in the `catch` block before returning 500:

```ts
} catch (err) {
  console.error("Stripe webhook processing error", err);
  await forgetWebhookEvent("STRIPE", event.id);
  return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
}
```

Do not change the `markWebhookProcessed` call or the success return.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Record `invoice.payment_failed` with the affected user

4a. In `src/app/api/webhooks/stripe/handler.ts`, add a pure helper that, given
the Stripe invoice object, extracts the fields worth logging (no DB access in
the pure helper):

```ts
export function describePaymentFailure(invoice: Stripe.Invoice) {
  return {
    stripeCustomerId: typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null,
    invoiceId: invoice.id,
    amountDue: invoice.amount_due ?? null,
    attemptCount: invoice.attempt_count ?? null,
  };
}
```

4b. In the route's `case "invoice.payment_failed"`, replace the bare
`console.warn` with: build the descriptor, look up the owning user via the
unique `stripeCustomerId`, and emit one structured warn line:

```ts
case "invoice.payment_failed": {
  const invoice = event.data.object as Stripe.Invoice;
  const info = describePaymentFailure(invoice);
  const sub = info.stripeCustomerId
    ? await prisma.subscription.findUnique({
        where: { stripeCustomerId: info.stripeCustomerId },
        select: { userId: true },
      })
    : null;
  console.warn("[stripe] invoice.payment_failed", { ...info, userId: sub?.userId ?? null });
  break;
}
```

Note: this DB read is inside the existing `try`, so if it throws the Step 3
rollback applies and Stripe retries — which is fine (idempotent read).

**Verify**: `pnpm typecheck` → exit 0.

### Step 5: Test `describePaymentFailure`

In `handler.test.ts`, add a `describe("describePaymentFailure")` block
following the existing `as never` fixture style. Cover: customer as string id;
customer as object with `.id`; missing customer → `stripeCustomerId: null`.

**Verify**: `pnpm test -- src/app/api/webhooks/stripe` → all pass.

### Step 6: Roll back on failure in the Clerk route

In `src/app/api/webhooks/clerk/route.ts`, wrap the `switch (eventType) { ... }`
block (lines 49-130) in a try/catch that rolls back and returns 500 so svix
re-delivers:

```ts
try {
  switch (eventType) {
    // ...unchanged cases...
  }
} catch (err) {
  console.error("[clerk-webhook] handler failed", { svixId: svix_id, eventType, err });
  await forgetWebhookEvent("CLERK", svix_id);
  return new Response("Webhook handler failed", { status: 500 });
}

return new Response("Webhook processed", { status: 200 });
```

Import `forgetWebhookEvent` from `@/lib/db/webhook-events`. Keep the existing
`markWebhookProcessed("CLERK", svix_id, eventType)` call and the duplicate-short-
circuit unchanged. The event id for Clerk is `svix_id` (must match what
`markWebhookProcessed` was given).

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 7: Full gate

**Verify**: `pnpm test` (all pass, including new tests), `pnpm typecheck`
(exit 0), `pnpm lint` (exit 0).

## Test plan

- `src/lib/db/webhook-events.test.ts` (new): `forgetWebhookEvent` issues the
  right `deleteMany` and is failure-tolerant; `markWebhookProcessed`
  new-vs-duplicate behavior.
- `handler.test.ts` (extend): `describePaymentFailure` field extraction for the
  three customer shapes.
- Pattern to follow: existing `handler.test.ts` (pure-function unit tests with
  cast fixtures). Do NOT attempt a full route integration test — the routes
  touch Prisma and the Stripe SDK directly and there is no harness for them.
- Verification: `pnpm test` → all pass with the new cases present.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0; new tests for `forgetWebhookEvent` and
      `describePaymentFailure` exist and pass
- [ ] `src/app/api/webhooks/stripe/route.ts` calls `forgetWebhookEvent("STRIPE", event.id)`
      in its catch block
- [ ] `src/app/api/webhooks/clerk/route.ts` wraps its switch in try/catch and
      calls `forgetWebhookEvent("CLERK", svix_id)` on failure
- [ ] `case "invoice.payment_failed"` logs a structured object including `userId`
      (or `null`) — `grep -n "invoice.payment_failed" src/app/api/webhooks/stripe/route.ts`
      shows it is no longer a bare `console.warn(string, object)`
- [ ] `git diff --stat -- prisma/schema.prisma` is empty (no schema change)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `markWebhookProcessed` no longer exists or no longer records *before* the
  handler runs (someone already restructured to record-after-success — then
  this plan is unnecessary; report it).
- `Stripe.Invoice` does not type-check with `invoice.amount_due` /
  `invoice.attempt_count` on the installed `stripe` version — drop those two
  fields from `describePaymentFailure` (keep `stripeCustomerId` + `invoiceId`)
  and note it; do not chase SDK type errors further.
- The `Subscription` model no longer has a unique `stripeCustomerId` — without
  it the user lookup is ambiguous; record `userId: null` and report.
- Any verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Trade-off introduced**: rolling back on failure converts "silently dropped"
  into "retried until the provider gives up" (Stripe ~3 days, svix similar). A
  *permanently* unprocessable event (e.g. a `checkout.session.completed` with no
  `userId` in metadata — `handler.ts:8` throws `"Missing userId..."`) will now
  retry-storm for that window instead of dropping. That is strictly better
  (visible in logs vs. silent data loss), but if retry-storms become noisy, the
  follow-up is to distinguish *permanent* errors (acknowledge with 200 + log)
  from *transient* ones (500 + rollback). Deferred — flagged here so a reviewer
  knows it was a conscious choice.
- Reviewer should confirm: no subscription-state mutation was added to
  `invoice.payment_failed`; the rollback uses the SAME event id that was marked
  (`event.id` for Stripe, `svix_id` for Clerk); and no schema/migration crept in.
- If a webhook route ever gains a genuinely non-idempotent side effect, the
  record-before-process + rollback model must be revisited (a retried delete or
  external call could double-fire). Today all handlers are upsert/updateMany/
  deleteMany keyed on stable ids, so re-delivery is safe.
