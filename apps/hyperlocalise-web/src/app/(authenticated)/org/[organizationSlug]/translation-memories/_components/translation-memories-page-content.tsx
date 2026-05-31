"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DatabaseSyncIcon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";

import {
  GLOSSARY_SYNC_FILTERS,
  PROJECT_SOURCE_FILTERS,
  readWorkspaceFilterParam,
  TMS_PROVIDER_KINDS,
} from "../../_components/workspace-filter-params";
import {
  PageHeader,
  WorkspaceFilterField,
  workspaceFilterTriggerClassName,
} from "../../_components/workspace-resource-shared";
import {
  buildProjectIdByExternalKey,
  mapMemoryToListRow,
  providerLabel,
  type ApiMemory,
  type MemoryListRow,
} from "./memory-list";
import {
  TranslationMemoriesEmptyAction,
  TranslationMemoriesTable,
} from "./translation-memories-table";

const MEMORIES_PAGE_SIZE = 100;

const sourceFilterLabels = {
  all: "All sources",
  native: "Workspace",
  external_tms: "Provider",
} as const;

const syncFilterLabels = {
  all: "All sync states",
  synced: "Synced",
  stale: "Stale",
  syncing: "Syncing",
  error: "Sync error",
} as const;

const memoriesQueryKey = (organizationSlug: string, page: number) => [
  "translation-memories",
  organizationSlug,
  page,
];
const projectsQueryKey = (organizationSlug: string) => [
  "translation-memory-projects",
  organizationSlug,
];
const credentialsQueryKey = (organizationSlug: string) => [
  "translation-memory-credentials",
  organizationSlug,
];

function useMemoryFilters(memories: MemoryListRow[], searchParams: URLSearchParams) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState(() =>
    readWorkspaceFilterParam(searchParams, "source", PROJECT_SOURCE_FILTERS),
  );
  const [providerFilter, setProviderFilter] = useState(() =>
    readWorkspaceFilterParam(searchParams, "provider", TMS_PROVIDER_KINDS),
  );
  const [syncFilter, setSyncFilter] = useState(() =>
    readWorkspaceFilterParam(searchParams, "sync", GLOSSARY_SYNC_FILTERS),
  );

  const filteredMemories = useMemo(() => {
    return memories.filter((memory) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = memory.name.toLowerCase().includes(query);
        const matchesProject = memory.externalProjectId?.toLowerCase().includes(query);
        const matchesMemoryId = memory.externalMemoryId?.toLowerCase().includes(query);
        if (!matchesName && !matchesProject && !matchesMemoryId) return false;
      }

      if (sourceFilter !== "all" && memory.source !== sourceFilter) return false;

      if (providerFilter !== "all") {
        if (memory.externalProviderKind !== providerFilter) return false;
      }

      if (syncFilter !== "all") {
        if (syncFilter === "error") {
          if (!memory.lastSyncErrorAt) return false;
        } else if (memory.syncState !== syncFilter) {
          return false;
        }
      }

      return true;
    });
  }, [memories, searchQuery, sourceFilter, providerFilter, syncFilter]);

  const activeFilterCount = [sourceFilter, providerFilter, syncFilter].filter(
    (f) => f !== "all",
  ).length;

  return {
    searchQuery,
    setSearchQuery,
    sourceFilter,
    setSourceFilter,
    providerFilter,
    setProviderFilter,
    syncFilter,
    setSyncFilter,
    filteredMemories,
    activeFilterCount,
  };
}

export function TranslationMemoriesPageContent({ organizationSlug }: { organizationSlug: string }) {
  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const projectsQuery = useQuery({
    queryKey: projectsQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });

      if (!response.ok) {
        throw new Error(`Failed to load projects (${response.status})`);
      }

      const body = await response.json();
      return body.projects;
    },
  });

  const credentialsQuery = useQuery({
    queryKey: credentialsQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"][
        "external-tms-provider-credential"
      ].$get({
        param: { organizationSlug },
      });

      if (!response.ok) {
        throw new Error(`Failed to load provider credentials (${response.status})`);
      }

      const body = await response.json();
      return body.externalTmsProviderCredentials;
    },
  });

  const memoriesQuery = useQuery({
    queryKey: memoriesQueryKey(organizationSlug, page),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"].$get({
        param: { organizationSlug },
        query: {
          limit: String(MEMORIES_PAGE_SIZE),
          offset: String((page - 1) * MEMORIES_PAGE_SIZE),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load translation memories (${response.status})`);
      }

      const body = await response.json();
      return {
        memories: body.memories as ApiMemory[],
        total: body.total as number,
      };
    },
  });

  const projectIdByExternalKey = useMemo(
    () => buildProjectIdByExternalKey(projectsQuery.data ?? []),
    [projectsQuery.data],
  );

  const memories = useMemo(
    () =>
      (memoriesQuery.data?.memories ?? []).map((memory) =>
        mapMemoryToListRow(memory, projectIdByExternalKey),
      ),
    [memoriesQuery.data?.memories, projectIdByExternalKey],
  );

  const memoryTotal = memoriesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(memoryTotal / MEMORIES_PAGE_SIZE));
  const pageStart = memoryTotal === 0 ? 0 : (page - 1) * MEMORIES_PAGE_SIZE + 1;
  const pageEnd = Math.min(page * MEMORIES_PAGE_SIZE, memoryTotal);

  const providerKinds = useMemo(() => {
    const kinds = new Set<string>();
    for (const memory of memories) {
      if (memory.externalProviderKind) {
        kinds.add(memory.externalProviderKind);
      }
    }
    return [...kinds].sort((a, b) => providerLabel(a).localeCompare(providerLabel(b)));
  }, [memories]);

  const {
    searchQuery,
    setSearchQuery,
    sourceFilter,
    setSourceFilter,
    providerFilter,
    setProviderFilter,
    syncFilter,
    setSyncFilter,
    filteredMemories,
    activeFilterCount,
  } = useMemoryFilters(memories, searchParams);

  useEffect(() => {
    setPage(1);
  }, [organizationSlug, searchQuery, sourceFilter, providerFilter, syncFilter]);

  useEffect(() => {
    if (memoriesQuery.isSuccess && page > totalPages) {
      setPage(totalPages);
    }
  }, [memoriesQuery.isSuccess, page, totalPages]);

  const hasExternalMemories = memories.some((memory) => memory.source === "external_tms");
  const connectedCredentials = (credentialsQuery.data ?? []).filter(
    (credential) => credential.validationStatus === "connected",
  );
  const hasConnectedProvider = credentialsQuery.isSuccess && connectedCredentials.length > 0;

  const emptyTitle = hasConnectedProvider
    ? "No translation memories yet"
    : "Connect a TMS provider";
  const emptyDescription = hasConnectedProvider
    ? "Provider translation memories appear here after sync. Native workspace memories can also be created from this page once creation is enabled."
    : "Connect Crowdin, Phrase, Smartling, or Lokalise from Integrations to sync translation memories into this workspace.";

  const memoryCountLabel =
    memoriesQuery.isSuccess && memoryTotal > 0
      ? `${memoryTotal} ${memoryTotal === 1 ? "memory" : "memories"}`
      : undefined;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        icon={DatabaseSyncIcon}
        label="Workspace"
        title="Translation Memories"
        description="Workspace and synced TMS translation memories. Provider memories stay read-only—connect credentials in Integrations."
        statusLabel={memoryCountLabel}
      />

      {memoriesQuery.isSuccess && memories.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-2">
          <WorkspaceFilterField label="Search" className="w-full sm:max-w-xs">
            <Input
              placeholder="Name, project, or external ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </WorkspaceFilterField>
          <WorkspaceFilterField label="Source" className="w-full sm:w-40">
            <Select
              value={sourceFilter}
              onValueChange={(value) => {
                setSourceFilter(value ?? "all");
                if (value === "native") {
                  setProviderFilter("all");
                  setSyncFilter("all");
                }
              }}
            >
              <SelectTrigger className={workspaceFilterTriggerClassName}>
                <SelectValue>
                  {sourceFilterLabels[sourceFilter as keyof typeof sourceFilterLabels] ??
                    sourceFilter}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" label={sourceFilterLabels.all}>
                  {sourceFilterLabels.all}
                </SelectItem>
                <SelectItem value="native" label={sourceFilterLabels.native}>
                  {sourceFilterLabels.native}
                </SelectItem>
                <SelectItem value="external_tms" label={sourceFilterLabels.external_tms}>
                  {sourceFilterLabels.external_tms}
                </SelectItem>
              </SelectContent>
            </Select>
          </WorkspaceFilterField>

          {hasExternalMemories && sourceFilter !== "native" ? (
            <WorkspaceFilterField label="Provider" className="w-full sm:w-40">
              <Select
                value={providerFilter}
                onValueChange={(value) => setProviderFilter(value ?? "all")}
              >
                <SelectTrigger className={workspaceFilterTriggerClassName}>
                  <SelectValue>
                    {providerFilter === "all"
                      ? "All providers"
                      : providerLabel(providerFilter as (typeof TMS_PROVIDER_KINDS)[number])}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" label="All providers">
                    All providers
                  </SelectItem>
                  {providerKinds.map((kind) => (
                    <SelectItem key={kind} value={kind} label={providerLabel(kind)}>
                      {providerLabel(kind)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </WorkspaceFilterField>
          ) : null}

          {hasExternalMemories && sourceFilter !== "native" ? (
            <WorkspaceFilterField label="Sync" className="w-full sm:w-40">
              <Select value={syncFilter} onValueChange={(value) => setSyncFilter(value ?? "all")}>
                <SelectTrigger className={workspaceFilterTriggerClassName}>
                  <SelectValue>
                    {syncFilterLabels[syncFilter as keyof typeof syncFilterLabels] ?? syncFilter}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" label={syncFilterLabels.all}>
                    {syncFilterLabels.all}
                  </SelectItem>
                  <SelectItem value="synced" label={syncFilterLabels.synced}>
                    {syncFilterLabels.synced}
                  </SelectItem>
                  <SelectItem value="stale" label={syncFilterLabels.stale}>
                    {syncFilterLabels.stale}
                  </SelectItem>
                  <SelectItem value="syncing" label={syncFilterLabels.syncing}>
                    {syncFilterLabels.syncing}
                  </SelectItem>
                  <SelectItem value="error" label={syncFilterLabels.error}>
                    {syncFilterLabels.error}
                  </SelectItem>
                </SelectContent>
              </Select>
            </WorkspaceFilterField>
          ) : null}

          {activeFilterCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setSourceFilter("all");
                setProviderFilter("all");
                setSyncFilter("all");
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}

      {memoriesQuery.isSuccess && memories.length > 0 && filteredMemories.length === 0 ? (
        <div className="text-sm text-foreground/52">
          No translation memories match your filters.{" "}
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSourceFilter("all");
              setProviderFilter("all");
              setSyncFilter("all");
            }}
            className="text-foreground/72 underline hover:text-foreground"
          >
            Clear filters
          </button>
        </div>
      ) : null}

      <TranslationMemoriesTable
        memories={filteredMemories}
        memoriesQuery={memoriesQuery}
        organizationSlug={organizationSlug}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        emptyAction={<TranslationMemoriesEmptyAction organizationSlug={organizationSlug} />}
      />

      {memoriesQuery.isSuccess && memoryTotal > MEMORIES_PAGE_SIZE ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-foreground/52">
            Showing {pageStart}–{pageEnd} of {memoryTotal} translation memories
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <p className="text-sm text-foreground/52">
              Page {page} of {totalPages}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
