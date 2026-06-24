"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { usePathname, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useEffect, Suspense } from "react";
import { analyticsEnabled } from "@/lib/analytics";

let posthogInitialized = false;
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (analyticsEnabled && posthogKey && !posthogInitialized) {
  posthog.init(posthogKey, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
    capture_pageview: false,
    capture_pageleave: true,
  });
  posthogInitialized = true;
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();

  useEffect(() => {
    if (!analyticsEnabled) return;
    if (pathname && ph) {
      const qs = searchParams?.toString();
      const url = window.origin + pathname + (qs ? `?${qs}` : "");
      ph.capture("$pageview", { $current_url: url });
    }
  }, [pathname, searchParams, ph]);

  return null;
}

function PostHogUserIdentify() {
  const { user, isLoaded } = useUser();
  const ph = usePostHog();

  useEffect(() => {
    if (!analyticsEnabled) return;
    if (!isLoaded) return;
    if (user && ph) {
      ph.identify(user.id, {
        email: user.emailAddresses[0]?.emailAddress,
      });
    } else if (!user && ph) {
      ph.reset();
    }
  }, [user, isLoaded, ph]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      <PostHogUserIdentify />
      {children}
    </PHProvider>
  );
}
