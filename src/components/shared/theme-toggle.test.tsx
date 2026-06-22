// @vitest-environment jsdom
import React from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./theme-toggle";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("ThemeToggle", () => {
  it("renders the same icon on the server and first client render", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const clientHtml = renderToString(<ThemeToggle />);

    const originalWindow = globalThis.window;
    let serverHtml = "";
    try {
      Reflect.deleteProperty(globalThis, "window");
      serverHtml = renderToString(<ThemeToggle />);
    } finally {
      globalThis.window = originalWindow;
    }

    expect(clientHtml).toContain("lucide-moon");
    expect(serverHtml).toContain("lucide-moon");
  });
});
