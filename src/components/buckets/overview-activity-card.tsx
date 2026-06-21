"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, ArrowRight, Clock } from "lucide-react";
import { useActivity } from "@/lib/queries/activity";
import { useInfoDrawerStore } from "@/lib/stores/info-drawer-store";
import { Avatar } from "@/components/info-drawer/avatar";
import { formatRelativeTime } from "@/components/info-drawer/format-time";
import { ACTION_VERBS, eventTarget } from "@/components/activity/event-format";

interface OverviewActivityCardProps {
  connectionId: string;
  bucket: string;
}

export function OverviewActivityCard({
  connectionId,
  bucket,
}: OverviewActivityCardProps) {
  const { events, isLoading, isError } = useActivity({ connectionId, bucket });
  const setScope = useInfoDrawerStore((s) => s.setScope);
  const open = useInfoDrawerStore((s) => s.open);

  const recent = events.slice(0, 5);

  const openDrawer = () => {
    setScope({ connectionId, bucket });
    open("activity");
  };

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          Recent activity
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 space-y-3">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {isError && (
          <p className="text-sm text-muted-foreground">
            Failed to load activity.
          </p>
        )}
        {!isLoading && !isError && recent.length === 0 && (
          <div className="flex flex-col flex-1 items-center justify-center text-center">
            <Clock className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-semibold mb-1">No activity yet</p>
            <p className="text-sm text-muted-foreground mb-3">
              Actions in this bucket will appear here.
            </p>
            <button
              type="button"
              onClick={openDrawer}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              View activity log
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}
        {!isLoading && !isError && recent.length > 0 && (
          <>
            <ul className="space-y-2">
              {recent.map((event) => (
                <li
                  key={event.id}
                  className="flex items-start gap-2 text-sm"
                >
                  <Avatar
                    userId={event.userId}
                    displayName={event.userDisplayName}
                    imageUrl={event.userImageUrl}
                    size={20}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{event.userDisplayName}</span>{" "}
                    <span className="text-muted-foreground">
                      {ACTION_VERBS[event.action]}
                    </span>{" "}
                    <span className="font-mono text-xs truncate">
                      {eventTarget(event)}
                    </span>
                    <div className="text-xs text-muted-foreground" title={new Date(event.createdAt).toISOString()}>
                      {formatRelativeTime(event.createdAt)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={openDrawer}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              View all activity
              <ArrowRight className="h-3 w-3" />
            </button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
