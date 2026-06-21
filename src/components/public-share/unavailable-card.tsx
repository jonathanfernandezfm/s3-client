import { ThemeToggle } from "@/components/shared/theme-toggle";

type Reason = "revoked" | "expired" | "exhausted" | "not-found";

const COPY: Record<Reason, { title: string; body: string }> = {
  revoked: {
    title: "Link revoked",
    body: "This link has been revoked by the sender.",
  },
  expired: {
    title: "Link expired",
    body: "This link is no longer available.",
  },
  exhausted: {
    title: "Download limit reached",
    body: "This link has reached its download limit.",
  },
  "not-found": {
    title: "Link not found",
    body: "This link doesn't exist or has been deleted.",
  },
};

export function UnavailableCard({ reason }: { reason: Reason }) {
  const { title, body } = COPY[reason];
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="bg-card text-card-foreground rounded-xl shadow border border-border p-8 max-w-md w-full text-center">
        <div className="flex justify-end mb-4">
          <ThemeToggle />
        </div>
        <h1 className="text-xl font-semibold mb-2 text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
