import { AppSidebar } from "@/components/shared/app-sidebar";
import { Header } from "@/components/shared/header";
import { DragProvider } from "@/lib/contexts/drag-context";
import { Notifications } from "@/components/shared/notifications";
import { UploadManager } from "@/components/browser/upload-manager";
import { CommandPaletteMount } from "@/components/command-palette/command-palette-mount";
import { InfoDrawer } from "@/components/info-drawer/info-drawer";
import { PropertiesDrawer } from "@/components/properties-drawer/properties-drawer";
import { VersionHistoryDialog } from "@/components/versions/version-history-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PlansModal } from "@/components/billing/plans-modal";
import { SkipToContent } from "@/components/shared/skip-to-content";
import { RouteFocus } from "@/components/shared/route-focus";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider>
    <DragProvider>
      <SkipToContent />
      <div className="flex h-screen overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col overflow-hidden outline-none">{children}</main>
        </div>
      </div>
      <RouteFocus />
      <InfoDrawer />
      <PropertiesDrawer />
      <VersionHistoryDialog />
      <Notifications />
      <UploadManager />
      <CommandPaletteMount />
      <PlansModal />
    </DragProvider>
    </TooltipProvider>
  );
}
