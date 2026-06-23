"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useLayoutStore } from "@/lib/stores/layout-store";
import { useSidebarStore } from "@/lib/stores/sidebar-store";
import { useWorkspaces } from "@/lib/queries/workspaces";
import {
  useConnections,
  useDeleteConnection,
  type ConnectionResponse,
} from "@/lib/queries/connections";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { useBookmarks, useReorderBookmarks } from "@/lib/queries/bookmarks";
import type { BookmarkResponse } from "@/lib/bookmarks-helpers";
import { useTier } from "@/hooks/use-tier";
import { ConnectionForm } from "@/components/connections/connection-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Database,
  Settings,
  Users,
  Plug,
  ChevronRight,
  ChevronDown,
  Briefcase,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  GripVertical,
  Link2,
  CreditCard,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function PinnedBucketItem({
  pin,
  isOverlay,
  onClick,
  onMiddleClick,
}: {
  pin: BookmarkResponse;
  isOverlay?: boolean;
  onClick?: () => void;
  onMiddleClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: pin.id, disabled: isOverlay });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      onClick={onClick}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onMiddleClick?.();
        }
      }}
      className="group flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-md hover:bg-sidebar-accent/50 text-sidebar-foreground text-sm"
    >
      <span className="relative size-3.5 shrink-0" {...listeners} {...attributes}>
        <Database className="size-3.5 text-muted-foreground absolute inset-0 transition-opacity opacity-100 group-hover:opacity-0" />
        <GripVertical className="size-3.5 text-muted-foreground absolute inset-0 transition-opacity opacity-0 group-hover:opacity-100 cursor-grab" />
      </span>
      <div className="min-w-0">
        <div className="truncate font-medium">{pin.bucket}</div>
        <div className="truncate text-xs text-muted-foreground">{pin.connectionName}</div>
      </div>
    </button>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: workspaces = [] } = useWorkspaces();
  const { data: connections = [] } = useConnections();
  const { collapsedWorkspaces, toggleWorkspace } = useSidebarStore();
  const { panes, focusedPaneId, resetTabToBuckets, updateTabBucket, addTab } = useLayoutStore();
  const deleteConnection = useDeleteConnection();
  const { addNotification } = useNotificationStore();
  const { data: allBookmarks = [] } = useBookmarks();
  const { can } = useTier();

  const bucketPins = allBookmarks.filter((bm) => bm.prefix === null);

  const reorderBookmarks = useReorderBookmarks();
  const [activePin, setActivePin] = useState<BookmarkResponse | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const pin = bucketPins.find((p) => p.id === event.active.id);
    setActivePin(pin ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActivePin(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = bucketPins.findIndex((p) => p.id === active.id);
    const newIndex = bucketPins.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(bucketPins, oldIndex, newIndex);
    reorderBookmarks.mutate(reordered.map((p) => p.id));
  };

  const [editingConnection, setEditingConnection] =
    useState<ConnectionResponse | null>(null);
  const [deletingConnection, setDeletingConnection] =
    useState<ConnectionResponse | null>(null);

  const connectionsByWorkspace = connections.reduce<
    Record<string, ConnectionResponse[]>
  >((acc, conn) => {
    if (!acc[conn.workspaceId]) acc[conn.workspaceId] = [];
    acc[conn.workspaceId].push(conn);
    return acc;
  }, {});

  const isSettingsActive =
    pathname === "/app/settings" || pathname.startsWith("/app/settings/");
  const isBillingActive = pathname === "/app/settings/billing";
  const isConnectionsActive =
    pathname === "/app/connections" || pathname.startsWith("/app/connections/");
  const isTeamsActive = pathname === "/app/teams" || pathname.startsWith("/app/teams/");
  const isSharesActive = pathname === "/app/shares" || pathname.startsWith("/app/shares/");
  const isBucketsActive =
    pathname === "/app/buckets" ||
    pathname.startsWith("/app/buckets/") ||
    pathname.startsWith("/app/browser/");

  const handleBucketsClick = () => {
    const targetPaneId = focusedPaneId || Object.keys(panes)[0];
    if (targetPaneId) {
      const pane = panes[targetPaneId];
      if (pane?.activeTabId) {
        resetTabToBuckets(targetPaneId, pane.activeTabId);
      }
    }
  };

  const handlePinnedBucketClick = (connectionId: string, connectionName: string, bucket: string) => {
    const targetPaneId = focusedPaneId || Object.keys(panes)[0];
    if (targetPaneId) {
      const pane = panes[targetPaneId];
      if (pane?.activeTabId) {
        updateTabBucket(targetPaneId, pane.activeTabId, connectionId, connectionName, bucket);
        router.push("/app/buckets");
      }
    }
  };

  const handlePinnedBucketMiddleClick = (connectionId: string, connectionName: string, bucket: string) => {
    const targetPaneId = focusedPaneId || Object.keys(panes)[0];
    if (targetPaneId) {
      addTab(targetPaneId, { type: "browser", connectionId, connectionName, bucket, path: "" });
      router.push("/app/buckets");
    }
  };

  const handleDelete = async () => {
    if (!deletingConnection) return;
    try {
      await deleteConnection.mutateAsync(deletingConnection.id);
      addNotification({
        type: "delete",
        title: "Connection deleted",
        description: "The connection has been removed.",
        status: "completed",
      });
    } catch (error) {
      addNotification({
        type: "error",
        title: "Error",
        error:
          error instanceof Error ? error.message : "Failed to delete connection",
        status: "error",
      });
    } finally {
      setDeletingConnection(null);
    }
  };

  const getDisplayName = (conn: ConnectionResponse) =>
    conn.name || conn.endpoint;

  return (
    <>
      <aside aria-label="Sidebar" className="w-64 border-r bg-sidebar-background min-h-screen flex flex-col">
        <div className="h-14 px-4 border-b flex items-center">
          <Link
            href="/app/buckets"
            className="flex items-center gap-2"
            onClick={handleBucketsClick}
          >
            <Image src="/logo.png" alt="S3 Dock" width={28} height={28} className="shrink-0" />
            <span className="font-semibold text-lg">S3 Dock</span>
          </Link>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto space-y-1">
          <Link
            href="/app/buckets"
            onClick={handleBucketsClick}
            aria-current={isBucketsActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              isBucketsActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50"
            )}
          >
            <Database className="h-4 w-4" />
            Buckets
          </Link>

          <Link
            href="/app/connections"
            aria-current={isConnectionsActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              isConnectionsActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50"
            )}
          >
            <Plug className="h-4 w-4" />
            Connections
          </Link>

          <Link
            href="/app/shares"
            aria-current={isSharesActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              isSharesActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50"
            )}
          >
            <Link2 className="h-4 w-4" />
            Shares
            {!can("shareLinks") && (
              <span className="ml-auto rounded-full border border-blue-500/30 bg-blue-500/20 px-1 text-[8px] font-medium text-blue-400">
                PRO
              </span>
            )}
          </Link>

          {bucketPins.length > 0 && (
            <div className="pt-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 pb-1">
                Pinned
              </p>
              <div className="space-y-0.5">
                <DndContext
                  sensors={sensors}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={bucketPins.map((p) => p.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {bucketPins.map((bm) => (
                      <PinnedBucketItem
                        key={bm.id}
                        pin={bm}
                        onClick={() => handlePinnedBucketClick(bm.connectionId, bm.connectionName, bm.bucket)}
                        onMiddleClick={() => handlePinnedBucketMiddleClick(bm.connectionId, bm.connectionName, bm.bucket)}
                      />
                    ))}
                  </SortableContext>
                  <DragOverlay>
                    {activePin ? (
                      <PinnedBucketItem pin={activePin} isOverlay />
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </div>
            </div>
          )}

          {workspaces.length > 0 && (
            <div className="pt-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 pb-1">
                Workspaces
              </p>
              <div className="space-y-0.5">
                {workspaces.map((workspace) => {
                  const isCollapsed = collapsedWorkspaces[workspace.id];
                  const workspaceConns =
                    connectionsByWorkspace[workspace.id] ?? [];
                  return (
                    <div key={workspace.id}>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleWorkspace(workspace.id)}
                          aria-expanded={!isCollapsed}
                          className="flex items-center gap-2 flex-1 px-3 py-1.5 rounded-md text-sm hover:bg-sidebar-accent/50 text-sidebar-foreground min-w-0"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          {workspace.type === "TEAM" ? (
                            <Users className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <Briefcase className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span className="truncate">{workspace.name}</span>
                        </button>
                        {workspace.role === "ADMIN" && (
                          workspace.type === "TEAM" ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                                  title="Add to team"
                                  aria-label="Add to team"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                  onClick={() => router.push(`/app/connections?workspaceId=${workspace.id}`)}
                                >
                                  <Plug className="h-3.5 w-3.5" />
                                  Add connection
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => router.push("/app/teams")}
                                >
                                  <Users className="h-3.5 w-3.5" />
                                  Add member
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <Link
                              href={`/app/connections?workspaceId=${workspace.id}`}
                              title="Add connection"
                              className="p-1 rounded hover:bg-sidebar-accent/50 text-muted-foreground hover:text-foreground shrink-0"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Link>
                          )
                        )}
                      </div>

                      {!isCollapsed && workspaceConns.length > 0 && (
                        <ul className="ml-7 mt-0.5 space-y-0.5">
                          {workspaceConns.map((conn) => {
                            const isConnActive = pathname.startsWith(
                              `/app/connections/${conn.id}`
                            );
                            return (
                              <li key={conn.id}>
                                <div
                                  className={cn(
                                    "group flex items-center gap-2 rounded-md text-xs",
                                    isConnActive
                                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                                  )}
                                >
                                  <Link
                                    href={`/app/connections/${conn.id}?tab=overview`}
                                    aria-current={isConnActive ? "page" : undefined}
                                    className="flex items-center gap-2 flex-1 min-w-0 px-3 py-1.5"
                                  >
                                    <Plug className="h-3 w-3 shrink-0" />
                                    <span className="truncate">
                                      {getDisplayName(conn)}
                                    </span>
                                  </Link>
                                  {conn.role === "ADMIN" && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mr-1"
                                          aria-label="Connection options"
                                        >
                                          <MoreHorizontal className="h-3 w-3" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-36">
                                        <DropdownMenuItem
                                          onClick={() => setEditingConnection(conn)}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                          Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onClick={() => setDeletingConnection(conn)}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                          Delete
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}

                <Link
                  href="/app/teams"
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors mt-1",
                    isTeamsActive
                      ? "text-sidebar-foreground font-medium"
                      : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  New team
                  {!can("teams") && (
                    <span className="ml-auto rounded-full border border-blue-500/30 bg-blue-500/20 px-1 text-[8px] font-medium text-blue-400">
                      PRO
                    </span>
                  )}
                </Link>
              </div>
            </div>
          )}
        </nav>

        <div className="p-4 border-t space-y-1">
          <Link
            href="/app/settings"
            aria-current={isSettingsActive && !isBillingActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              isSettingsActive && !isBillingActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50"
            )}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <Link
            href="/app/settings/billing"
            aria-current={isBillingActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              isBillingActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50"
            )}
          >
            <CreditCard className="h-4 w-4" />
            Billing
          </Link>
        </div>
      </aside>

      {/* Edit dialog */}
      <Dialog
        open={!!editingConnection}
        onOpenChange={(open) => {
          if (!open) setEditingConnection(null);
        }}
      >
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Edit Connection</DialogTitle>
          </DialogHeader>
          <ConnectionForm
            connection={editingConnection ?? undefined}
            onSuccess={() => setEditingConnection(null)}
            onCancel={() => setEditingConnection(null)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deletingConnection}
        onOpenChange={(open) => {
          if (!open) setDeletingConnection(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Connection</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;
              {deletingConnection && getDisplayName(deletingConnection)}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingConnection(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteConnection.isPending}
            >
              {deleteConnection.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
