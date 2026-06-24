"use client";

import { useState } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useNotificationStore } from "@/lib/stores/notification-store";

type FeedbackType = "FEEDBACK" | "BUG_REPORT";

export function FeedbackDialog() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("FEEDBACK");
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);
  const { addNotification } = useNotificationStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsPending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message: message.trim() }),
      });

      if (!res.ok) throw new Error("Failed to submit");

      addNotification({
        type: "folder",
        title: "Thanks for your feedback!",
        description: "Your message has been received.",
        status: "completed",
      });
      setMessage("");
      setType("FEEDBACK");
      setOpen(false);
    } catch {
      addNotification({
        type: "error",
        title: "Failed to submit feedback",
        error: "Please try again.",
        status: "error",
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors w-full text-sidebar-foreground hover:bg-sidebar-accent/50"
        >
          <MessageSquare className="h-4 w-4" />
          Feedback
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Send Feedback</DialogTitle>
            <DialogDescription>
              Share a suggestion or report a bug. We read everything.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType("FEEDBACK")}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  type === "FEEDBACK"
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-input text-muted-foreground hover:text-foreground"
                }`}
              >
                Suggestion
              </button>
              <button
                type="button"
                onClick={() => setType("BUG_REPORT")}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  type === "BUG_REPORT"
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-input text-muted-foreground hover:text-foreground"
                }`}
              >
                Bug Report
              </button>
            </div>
            <div>
              <Label htmlFor="feedback-message">
                {type === "BUG_REPORT" ? "Describe the bug" : "Your suggestion"}
              </Label>
              <Textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  type === "BUG_REPORT"
                    ? "What happened? What did you expect?"
                    : "What would make S3 Dock better for you?"
                }
                className="mt-2 min-h-[120px]"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !message.trim()}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
