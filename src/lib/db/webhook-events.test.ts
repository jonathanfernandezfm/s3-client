import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing the module under test
vi.mock("@/lib/db/prisma", () => ({
  default: {
    webhookEvent: {
      create: vi.fn(),
    },
  },
}));

import prisma from "@/lib/db/prisma";
import { markWebhookProcessed } from "./webhook-events";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("markWebhookProcessed", () => {
  test("returns 'new' and calls create once for a new event", async () => {
    (prisma.webhookEvent.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await markWebhookProcessed("STRIPE", "evt_1", "checkout.session.completed");

    expect(result).toBe("new");
    expect(prisma.webhookEvent.create).toHaveBeenCalledOnce();
    expect(prisma.webhookEvent.create).toHaveBeenCalledWith({
      data: { source: "STRIPE", eventId: "evt_1", eventType: "checkout.session.completed" },
    });
  });

  test("returns 'duplicate' when create throws P2002", async () => {
    (prisma.webhookEvent.create as ReturnType<typeof vi.fn>).mockRejectedValue({
      code: "P2002",
    });

    const result = await markWebhookProcessed("STRIPE", "evt_1", "checkout.session.completed");

    expect(result).toBe("duplicate");
  });

  test("rethrows errors that are not P2002", async () => {
    const dbError = new Error("Connection refused");
    (prisma.webhookEvent.create as ReturnType<typeof vi.fn>).mockRejectedValue(dbError);

    await expect(
      markWebhookProcessed("CLERK", "svix_abc", "user.created")
    ).rejects.toThrow("Connection refused");
  });
});
