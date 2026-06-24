import posthog from "posthog-js";

/**
 * Analytics is enabled only for production builds — so local `next dev` and the
 * Vitest runner never send events to the shared PostHog project — and only when
 * a project key is configured. Set NEXT_PUBLIC_POSTHOG_FORCE_ENABLE=true to opt
 * a local/dev session in for verification.
 */
export function isAnalyticsEnabled(env: {
  NEXT_PUBLIC_POSTHOG_KEY?: string;
  NODE_ENV?: string;
  NEXT_PUBLIC_POSTHOG_FORCE_ENABLE?: string;
}): boolean {
  if (!env.NEXT_PUBLIC_POSTHOG_KEY) return false;
  if (env.NEXT_PUBLIC_POSTHOG_FORCE_ENABLE === "true") return true;
  return env.NODE_ENV === "production";
}

export const analyticsEnabled = isAnalyticsEnabled(process.env);

export type TrackableEvent =
  | { name: "connection_created"; props: { workspace_type: "PERSONAL" | "TEAM" } }
  | { name: "connection_deleted" }
  | { name: "files_deleted"; props: { count: number } }
  | { name: "folder_created" }
  | { name: "files_copied"; props: { count: number; cross_connection: boolean } }
  | { name: "files_moved"; props: { count: number; cross_connection: boolean } }
  | { name: "share_link_created" }
  | { name: "checkout_initiated" };

export function track(event: TrackableEvent) {
  if (typeof window === "undefined") return;
  if (!analyticsEnabled) return;
  try {
    posthog.capture(event.name, "props" in event ? event.props : {});
  } catch {
    // analytics must never break application flow
  }
}
