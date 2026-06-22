"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  Database,
  Folder,
  Plug,
  Plus,
  Settings,
  Star,
  Users,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useLayoutStore } from "@/lib/stores/layout-store";
import { useRecentLocationsStore } from "@/lib/stores/recent-locations-store";
import { usePaletteIntentStore } from "@/lib/stores/palette-intent-store";
import { usePaletteItems } from "./use-palette-items";
import type { PinnedItem } from "./use-palette-items";
import { useGlobalSearch } from "@/lib/queries/search";
import { useTier } from "@/hooks/use-tier";
import { useUpgradeModalStore } from "@/lib/stores/upgrade-modal-store";
import { SearchResultsGroup } from "./search-results-group";
import { OperatorChips } from "./operator-chips";
import { parseSearchQuery } from "@/lib/search/query";
import { parentPrefix } from "@/lib/browser/browser-url";

function mapParsedToEcho(p: ReturnType<typeof parseSearchQuery>) {
  return {
    freeText: p.freeText,
    mime: p.mime,
    ext: p.ext,
    sizeMin: p.sizeMin?.toString(),
    sizeMax: p.sizeMax?.toString(),
    before: p.before?.toISOString(),
    after: p.after?.toISOString(),
    bucket: p.bucket,
    connection: p.connection,
    tag: p.tag,
  };
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const items = usePaletteItems();
  const pushRecent = useRecentLocationsStore((s) => s.pushRecent);
  const requestIntent = usePaletteIntentStore((s) => s.requestIntent);
  const {
    panes,
    focusedPaneId,
    updateTabBucket,
    updateTabPath,
    resetTabToBuckets,
    getActiveTab,
  } = useLayoutStore();

  const paneId = focusedPaneId ?? Object.keys(panes)[0] ?? null;
  const activeTab = paneId ? getActiveTab(paneId) : null;

  const [searchValue, setSearchValue] = useState("");
  const isFileSearch = searchValue.trim().length >= 2;
  const parsedQuery = useMemo(() => parseSearchQuery(searchValue), [searchValue]);
  const { tier } = useTier();
  const isPro = tier === "PRO" || tier === "ENTERPRISE";
  const search = useGlobalSearch(searchValue);
  const openUpgrade = useUpgradeModalStore((s) => s.open);

  const close = () => {
    setSearchValue("");
    onOpenChange(false);
  };

  const navigateToBucket = (item: {
    connectionId: string;
    connectionName: string;
    bucket: string;
  }) => {
    if (!paneId || !activeTab) return;
    updateTabBucket(
      paneId,
      activeTab.id,
      item.connectionId,
      item.connectionName,
      item.bucket
    );
    pushRecent({
      connectionId: item.connectionId,
      connectionName: item.connectionName,
      bucket: item.bucket,
      path: "",
    });
    close();
  };

  const navigateToFolder = (folder: {
    connectionId: string;
    bucket: string;
    key: string;
  }) => {
    if (!paneId || !activeTab) return;
    updateTabPath(paneId, activeTab.id, folder.key);
    const connectionName =
      items.connections.find((c) => c.connectionId === folder.connectionId)?.name ??
      folder.connectionId;
    pushRecent({
      connectionId: folder.connectionId,
      connectionName,
      bucket: folder.bucket,
      path: folder.key,
    });
    close();
  };

  const navigateToRecent = (recent: {
    connectionId: string;
    connectionName: string;
    bucket: string;
    path: string;
  }) => {
    if (!paneId || !activeTab) return;
    const sameBucket =
      activeTab.type === "browser" &&
      activeTab.connectionId === recent.connectionId &&
      activeTab.bucket === recent.bucket;
    if (!sameBucket) {
      updateTabBucket(
        paneId,
        activeTab.id,
        recent.connectionId,
        recent.connectionName,
        recent.bucket
      );
    }
    if (recent.path) {
      updateTabPath(paneId, activeTab.id, recent.path);
    }
    pushRecent(recent);
    close();
  };

  const navigateToPinned = (item: PinnedItem) => {
    if (!paneId || !activeTab) return;
    const sameBucket =
      activeTab.type === "browser" &&
      activeTab.connectionId === item.connectionId &&
      activeTab.bucket === item.bucket;
    if (!sameBucket) {
      updateTabBucket(
        paneId,
        activeTab.id,
        item.connectionId,
        item.connectionName,
        item.bucket
      );
    }
    if (item.prefix) {
      updateTabPath(paneId, activeTab.id, item.prefix);
    }
    pushRecent({
      connectionId: item.connectionId,
      connectionName: item.connectionName,
      bucket: item.bucket,
      path: item.prefix ?? "",
    });
    close();
  };

  const navigateToConnectionAnchor = (connectionId: string) => {
    if (paneId && activeTab) {
      resetTabToBuckets(paneId, activeTab.id);
    }
    router.push("/app/buckets");
    setTimeout(() => {
      document
        .getElementById(`connection-${connectionId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    close();
  };

  const navigateToTeam = (teamId: string) => {
    router.push(`/app/teams?teamId=${teamId}`);
    close();
  };

  const runCreateConnection = () => {
    requestIntent({ kind: "create-connection" });
    router.push("/app/connections");
    close();
  };

  const runCreateTeam = () => {
    requestIntent({ kind: "create-team" });
    router.push("/app/teams");
    close();
  };

  const runCreateBucket = () => {
    if (!items.activeBucket) return;
    requestIntent({
      kind: "create-bucket",
      connectionId: items.activeBucket.connectionId,
    });
    router.push("/app/buckets");
    close();
  };

  const runCreateFolder = () => {
    if (!items.activeBucket) return;
    requestIntent({
      kind: "create-folder",
      connectionId: items.activeBucket.connectionId,
      bucket: items.activeBucket.bucket,
      path: items.activeBucket.path,
    });
    close();
  };

  const renderItem = (
    key: string,
    value: string,
    icon: React.ReactNode,
    label: string,
    subtitle: string | undefined,
    onSelect: () => void
  ) => (
    <CommandItem key={key} value={value} onSelect={onSelect}>
      <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{label}</span>
        {subtitle && (
          <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
        )}
      </div>
    </CommandItem>
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={!isFileSearch}>
      <CommandInput
        placeholder="Search or run a command..."
        value={searchValue}
        onValueChange={setSearchValue}
      />
      <OperatorChips parsed={mapParsedToEcho(parsedQuery)} query={searchValue} onQueryChange={setSearchValue} />
      <CommandList>
        {!isFileSearch && <CommandEmpty>No results.</CommandEmpty>}

        <SearchResultsGroup
          query={searchValue}
          data={search.data}
          isLoading={search.isLoading || search.isFetching}
          isError={search.isError}
          showLockedTeaser={!isPro}
          onUpgradeClick={() => {
            openUpgrade();
            close();
          }}
          onSelectFile={(r) => {
            const dir = parentPrefix(r.key);
            requestIntent({ kind: "open-preview", connectionId: r.connectionId, bucket: r.bucket, key: r.key });
            pushRecent({ connectionId: r.connectionId, connectionName: r.connectionName ?? r.connectionId, bucket: r.bucket, path: dir });
            router.push(r.href);
            close();
          }}
          onSelectFolder={(r) => {
            pushRecent({ connectionId: r.connectionId, connectionName: r.connectionName ?? r.connectionId, bucket: r.bucket, path: r.key });
            router.push(r.href);
            close();
          }}
        />

        {!isFileSearch && items.pinned.length > 0 && (
          <>
            <CommandGroup heading="Pinned">
              {items.pinned.map((item) => {
                const displayLabel = item.label ?? (item.prefix ? item.prefix.replace(/\/$/, "") : item.bucket);
                const value = `pinned ${item.bucket} ${item.prefix ?? ""} ${item.connectionName}`;
                return (
                  <CommandItem
                    key={item.id}
                    value={value}
                    onSelect={() => navigateToPinned(item)}
                  >
                    <span className="flex h-5 w-5 items-center justify-center">
                      <Star className="h-4 w-4 text-yellow-400" fill="currentColor" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{displayLabel}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {item.connectionName} · {item.bucket}{item.prefix ? "/" + item.prefix : ""}
                      </span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {!isFileSearch && items.recents.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {items.recents.slice(0, 5).map((r) => {
                const subtitle = `${r.connectionName} · ${r.bucket}${r.path ? "/" + r.path : ""}`;
                const value = `recent ${r.bucket} ${r.path} ${r.connectionName}`;
                return renderItem(
                  `recent-${r.connectionId}-${r.bucket}-${r.path}`,
                  value,
                  <Clock className="h-4 w-4" />,
                  r.path ? r.path.replace(/\/$/, "") || r.bucket : r.bucket,
                  subtitle,
                  () => navigateToRecent(r)
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {!isFileSearch && <CommandGroup heading="Actions">
          {renderItem(
            "action-new-connection",
            "create new connection add",
            <Plus className="h-4 w-4" />,
            "Create connection",
            "Add a new S3 endpoint",
            runCreateConnection
          )}
          {renderItem(
            "action-new-team",
            "create new team add",
            <Plus className="h-4 w-4" />,
            "Create team",
            "Start a new team workspace",
            runCreateTeam
          )}
          {items.activeBucket &&
            renderItem(
              "action-new-bucket",
              "create new bucket add",
              <Plus className="h-4 w-4" />,
              "Create bucket",
              `In ${items.activeBucket.connectionId}`,
              runCreateBucket
            )}
          {items.activeBucket &&
            renderItem(
              "action-new-folder",
              "create new folder add",
              <Plus className="h-4 w-4" />,
              "Create folder",
              `In ${items.activeBucket.bucket}${items.activeBucket.path ? "/" + items.activeBucket.path : ""}`,
              runCreateFolder
            )}
          {renderItem(
            "action-open-settings",
            "open settings preferences",
            <Settings className="h-4 w-4" />,
            "Open settings",
            undefined,
            () => {
              router.push("/app/settings");
              close();
            }
          )}
        </CommandGroup>}

        {!isFileSearch && items.connections.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Connections">
              {items.connections.map((c) => {
                const value = `connection ${c.name} ${c.endpoint}`;
                return renderItem(
                  `connection-${c.connectionId}`,
                  value,
                  <Plug className="h-4 w-4" />,
                  c.name,
                  c.endpoint,
                  () => navigateToConnectionAnchor(c.connectionId)
                );
              })}
            </CommandGroup>
          </>
        )}

        {!isFileSearch && items.buckets.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Buckets">
              {items.buckets.map((b) => {
                const value = `bucket ${b.bucket} ${b.connectionName}`;
                return renderItem(
                  `bucket-${b.connectionId}-${b.bucket}`,
                  value,
                  <Database className="h-4 w-4" />,
                  b.bucket,
                  b.connectionName,
                  () => navigateToBucket(b)
                );
              })}
            </CommandGroup>
          </>
        )}

        {!isFileSearch && items.folders.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup
              heading={
                items.isFoldersTruncated
                  ? "Folders here (first 1000 shown)"
                  : "Folders here"
              }
            >
              {items.folders.map((f) => {
                const value = `folder ${f.label} ${f.parentPath}`;
                return renderItem(
                  `folder-${f.connectionId}-${f.bucket}-${f.key}`,
                  value,
                  <Folder className="h-4 w-4" />,
                  f.label,
                  `${f.bucket}/${f.parentPath}`,
                  () => navigateToFolder(f)
                );
              })}
            </CommandGroup>
          </>
        )}

        {!isFileSearch && items.teams.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Teams">
              {items.teams.map((t) => {
                const value = `team ${t.name} ${t.slug ?? ""}`;
                return renderItem(
                  `team-${t.teamId}`,
                  value,
                  <Users className="h-4 w-4" />,
                  t.name,
                  t.slug ?? undefined,
                  () => navigateToTeam(t.teamId)
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
