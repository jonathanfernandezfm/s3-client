"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { PostHogProvider } from "@/components/providers/posthog-provider";
import { ClerkThemeProvider } from "@/components/providers/clerk-theme-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ClerkThemeProvider>
      <QueryClientProvider client={queryClient}>
        <PostHogProvider>
          {children}
        </PostHogProvider>
      </QueryClientProvider>
    </ClerkThemeProvider>
  );
}
