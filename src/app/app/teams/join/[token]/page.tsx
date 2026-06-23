"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useNotificationStore } from "@/lib/stores/notification-store";

interface InvitePreview {
  teamId: string;
  teamName: string;
  role: string;
}

export default function JoinTeamPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { addNotification } = useNotificationStore();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchPreview() {
      try {
        const res = await fetch(`/api/teams/invites/${token}`);
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json();
          setError(body.error ?? "This invite link is not valid.");
        } else {
          const data = await res.json();
          setPreview(data);
        }
      } catch {
        if (!cancelled) setError("Failed to load invite. Please try again.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void fetchPreview();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleAccept() {
    setIsAccepting(true);
    try {
      const res = await fetch(`/api/teams/invites/${token}/accept`, {
        method: "POST",
      });
      const body = await res.json();

      if (!res.ok) {
        addNotification({
          type: "error",
          title: "Could not join team",
          error: body.error ?? "Unknown error",
          status: "error",
        });
        return;
      }

      addNotification({
        type: "info",
        title: body.alreadyMember ? "Already a member" : "Welcome to the team!",
        description: body.alreadyMember
          ? "You are already a member of this team."
          : `You joined as ${(body.role as string).toLowerCase()}.`,
        status: "completed",
      });

      router.push("/app/teams");
    } catch {
      addNotification({
        type: "error",
        title: "Could not join team",
        error: "Network error. Please try again.",
        status: "error",
      });
    } finally {
      setIsAccepting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invite unavailable</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => router.push("/app/teams")}>
              Go to Teams
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!preview) return null;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>You&apos;ve been invited</CardTitle>
          <CardDescription>
            Join <strong>{preview.teamName}</strong> as{" "}
            <strong>{preview.role.charAt(0) + preview.role.slice(1).toLowerCase()}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button onClick={handleAccept} disabled={isAccepting}>
            {isAccepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Accept invite
          </Button>
          <Button variant="outline" onClick={() => router.push("/app/teams")}>
            Decline
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
