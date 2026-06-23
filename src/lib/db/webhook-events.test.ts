import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing the module under test
vi.mock("@/lib/db/prisma", () => ({
  default: {
    webhookEvent: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import prisma from "@/lib/db/prisma";
import { markWebhookProcessed, forgetWebhookEvent } from "./webhook-events";

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

describe("forgetWebhookEvent", () => {
  test("calls deleteMany with the correct source and eventId", async () => {
    (prisma.webhookEvent.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    await forgetWebhookEvent("STRIPE", "evt_1");

    expect(prisma.webhookEvent.deleteMany).toHaveBeenCalledOnce();
    expect(prisma.webhookEvent.deleteMany).toHaveBeenCalledWith({
      where: { source: "STRIPE", eventId: "evt_1" },
    });
  });

  test("resolves without throwing even when deleteMany rejects", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (prisma.webhookEvent.deleteMany as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("DB timeout")
    );

    await expect(forgetWebhookEvent("CLERK", "svix_abc")).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      "[webhook] failed to roll back idempotency row",
      expect.objectContaining({ source: "CLERK", eventId: "svix_abc" })
    );
    consoleSpy.mockRestore();
  });

  test("works with CLERK source", async () => {
    (prisma.webhookEvent.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    await forgetWebhookEvent("CLERK", "svix_xyz");

    expect(prisma.webhookEvent.deleteMany).toHaveBeenCalledWith({
      where: { source: "CLERK", eventId: "svix_xyz" },
    });
  });
});
