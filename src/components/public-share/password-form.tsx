import { ThemeToggle } from "@/components/shared/theme-toggle";

type Props = {
  slug: string;
  error?: string;
};

export function PasswordForm({ slug, error }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <form
        method="POST"
        action={`/s/${slug}/unlock`}
        className="bg-card text-card-foreground rounded-xl shadow border border-border p-8 max-w-md w-full"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Password required</h1>
            <p className="text-sm text-muted-foreground mt-1">
              This share link is password-protected.
            </p>
          </div>
          <ThemeToggle />
        </div>
        <input
          type="password"
          name="password"
          autoFocus
          required
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring mb-3"
          placeholder="Password"
        />
        {error === "invalid" && (
          <p className="text-sm text-destructive mb-3">Invalid password.</p>
        )}
        {error === "rate-limited" && (
          <p className="text-sm text-destructive mb-3">
            Too many attempts. Try again in an hour.
          </p>
        )}
        <button
          type="submit"
          className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}
