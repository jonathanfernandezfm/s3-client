import { ThemeToggle } from "@/components/shared/theme-toggle";

type Props = {
  teamLabel: string;
  expiresAt: Date | null;
};

function formatExpiry(d: Date): string {
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) return "expired";
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days >= 1) return `Expires in ${days}d`;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours >= 1) return `Expires in ${hours}h`;
  const mins = Math.floor(diffMs / (1000 * 60));
  return `Expires in ${mins}m`;
}

export function BrandHeader({ teamLabel, expiresAt }: Props) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
      <div className="w-6 h-6 bg-foreground rounded-md" />
      <span className="text-xs font-semibold tracking-wider uppercase text-foreground">
        {teamLabel}
      </span>
      <span className="flex-1" />
      {expiresAt && (
        <span className="text-xs text-muted-foreground">{formatExpiry(expiresAt)}</span>
      )}
      <ThemeToggle />
    </div>
  );
}
