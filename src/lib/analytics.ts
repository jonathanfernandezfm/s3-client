import posthog from "posthog-js";

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
  try {
    posthog.capture(event.name, "props" in event ? event.props : {});
  } catch {
    // analytics must never break application flow
  }
}
