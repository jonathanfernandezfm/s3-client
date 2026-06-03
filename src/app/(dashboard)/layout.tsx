import { AppSidebar } from "@/components/shared/app-sidebar";
import { Header } from "@/components/shared/header";
import { DragProvider } from "@/lib/contexts/drag-context";
import { Notifications } from "@/components/shared/notifications";
import { CommandPaletteMount } from "@/components/command-palette/command-palette-mount";
import { ActivityDrawer } from "@/components/activity/activity-drawer";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DragProvider>
      <div className="flex h-screen overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
        </div>
      </div>
      <ActivityDrawer />
      <Notifications />
      <CommandPaletteMount />
    </DragProvider>
  );
}
