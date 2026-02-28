"use client";

import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "./theme-toggle";
import { WorkspaceSwitcher } from "./workspace-switcher";

export function Header() {
  return (
    <header className="h-14 border-b bg-background flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <WorkspaceSwitcher />
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserButton
          afterSignOutUrl="/sign-in"
          appearance={{
            elements: {
              avatarBox: "h-8 w-8",
            },
          }}
        />
      </div>
    </header>
  );
}
