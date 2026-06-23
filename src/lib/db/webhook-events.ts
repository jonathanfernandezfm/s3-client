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

/**
 * Delete the idempotency row so the provider's retry is treated as a new event.
 *
 * Call ONLY after the handler failed and you are about to return a non-2xx response.
 * Errors are swallowed (logged only) so they never mask the original handler error.
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
      reason: err,
    });
  }
}
