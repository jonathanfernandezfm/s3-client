const REQUIRED = [
  "DATABASE_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "ENCRYPTION_KEY",
  "SHARE_LINK_COOKIE_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRO_PRICE_ID",
] as const;

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const problems: string[] = [];

  for (const key of REQUIRED) {
    if (!env[key] || env[key]!.trim() === "") {
      problems.push(`${key} is required but not set`);
    }
  }

  // Format checks for the two hex secrets (64 hex chars = 32 bytes).
  for (const key of ["ENCRYPTION_KEY", "SHARE_LINK_COOKIE_SECRET"] as const) {
    const val = env[key];
    if (val && !/^[0-9a-fA-F]{64}$/.test(val)) {
      problems.push(`${key} must be a 64-character hex string (32 bytes)`);
    }
  }

  // Conditional: search indexing needs the internal token.
  if (env.SEARCH_INDEX_ENABLED === "true" && !env.INTERNAL_API_TOKEN) {
    problems.push(
      "INTERNAL_API_TOKEN is required when SEARCH_INDEX_ENABLED=true"
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n  - ${problems.join("\n  - ")}`
    );
  }
}
