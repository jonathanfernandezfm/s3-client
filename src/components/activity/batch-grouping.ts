import type { ActivityEventResponse } from "@/lib/queries/activity";

export type SingleRow = {
  type: "single";
  event: ActivityEventResponse;
};

export type BatchRow = {
  type: "batch";
  batchId: string;
  userId: string | null;
  userDisplayName: string;
  userImageUrl: string | null;
  action: ActivityEventResponse["action"];
  bucket: string;
  createdAt: string;
  count: number;
  children: ActivityEventResponse[];
  isExpanded: boolean;
};

export type ActivityRow = SingleRow | BatchRow;

export function groupActivityEvents(events: ActivityEventResponse[]): ActivityRow[] {
  const rows: ActivityRow[] = [];

  let i = 0;
  while (i < events.length) {
    const e = events[i];

    if (!e.batchId) {
      rows.push({ type: "single", event: e });
      i++;
      continue;
    }

    // Collect all consecutive events with the same (userId, action, batchId)
    const group: ActivityEventResponse[] = [e];
    let j = i + 1;
    while (
      j < events.length &&
      events[j].batchId === e.batchId &&
      events[j].userId === e.userId &&
      events[j].action === e.action
    ) {
      group.push(events[j]);
      j++;
    }

    rows.push({
      type: "batch",
      batchId: e.batchId,
      userId: e.userId,
      userDisplayName: e.userDisplayName,
      userImageUrl: e.userImageUrl,
      action: e.action,
      bucket: e.bucket,
      createdAt: e.createdAt,
      count: group.length,
      children: group,
      isExpanded: false,
    });

    i = j;
  }

  return rows;
}
