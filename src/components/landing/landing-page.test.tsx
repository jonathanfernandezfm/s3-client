// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LandingPage } from "./landing-page";

// Clerk components need a provider; on the landing page they only gate CTAs.
vi.mock("@clerk/nextjs", () => ({
  SignedIn: () => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

afterEach(() => {
  cleanup();
});

beforeAll(() => {
  // jsdom lacks these APIs that motion relies on
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

  class MockObserver {
    root = null;
    rootMargin = "";
    thresholds = [];
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = () => [];
  }
  window.IntersectionObserver = MockObserver;
  window.ResizeObserver = MockObserver;
});

describe("LandingPage", () => {
  it("renders the hero headline", () => {
    render(<LandingPage />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("usable");
  });

  it("renders every landing section heading", () => {
    render(<LandingPage />);
    for (const heading of [
      "The AWS console wasn't built for humans.",
      "Power tools, zero terminal.",
      "Move files between any two buckets.",
      "One client. Every S3.",
      "Storage your whole team can actually use.",
      "Simple pricing. No surprises.",
      "Stop fighting the console.",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeDefined();
    }
  });

  it("renders the metaphor beats", () => {
    render(<LandingPage />);
    expect(screen.getAllByText("Folders, not prefixes.").length).toBeGreaterThan(0);
  });
});
