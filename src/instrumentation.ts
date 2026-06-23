import { validateEnv } from "@/lib/env";

export async function register() {
  // Only validate in the Node.js server runtime (not edge, not build-time
  // static analysis). NEXT_RUNTIME is "nodejs" for the server process.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    validateEnv();
  }
}
