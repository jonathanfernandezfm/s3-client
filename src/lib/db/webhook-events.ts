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
