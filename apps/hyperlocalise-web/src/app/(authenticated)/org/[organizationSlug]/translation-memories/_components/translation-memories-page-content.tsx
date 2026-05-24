"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight01Icon, DatabaseSyncIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { MetricsGrid, PageHeader } from "../../_components/workspace-resource-shared";
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

function TranslationMemoriesMetrics({
  memories,
  total,
}: {
  memories: MemoryListRow[];
  total: number;
}) {
  const metrics = useMemo(() => {
    const providerMemories = memories.filter((memory) => memory.source === "external_tms");
    const syncedCount = providerMemories.filter(
      (memory) => memory.syncState === "synced" && !memory.lastSyncErrorAt,
    ).length;
    const errorCount = providerMemories.filter((memory) => memory.lastSyncErrorAt).length;
    const localeCount = new Set(memories.flatMap((memory) => memory.localeCoverage)).size;
    const segmentTotal = memories.reduce((sum, memory) => sum + (memory.segmentCount ?? 0), 0);
    const segmentLabel =
      segmentTotal >= 1_000_000
        ? `${(segmentTotal / 1_000_000).toFixed(1)}M`
        : segmentTotal >= 1_000
          ? `${(segmentTotal / 1_000).toFixed(1)}k`
          : `${segmentTotal}`;
    const providerCountOnPage = providerMemories.length;
    const providerDetail =
      total > memories.length
        ? `${providerCountOnPage} provider on this page`
        : `${providerCountOnPage} provider`;

    return [
      {
        label: "Memory stores",
        value: `${total}`,
        detail: providerDetail,
        tone: "info" as const,
      },
      {
        label: "Locales covered",
        value: `${localeCount}`,
        detail: `${segmentLabel} segments`,
        tone: "safe" as const,
      },
      {
        label: "Sync health",
        value: `${syncedCount}`,
        detail: errorCount > 0 ? `${errorCount} errors` : "healthy",
        tone: errorCount > 0 ? ("watch" as const) : ("safe" as const),
      },
    ] as const;
  }, [memories, total]);

  return <MetricsGrid metrics={metrics} />;
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

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeader
        icon={DatabaseSyncIcon}
        label="Manage"
        title="Translation Memories"
        description="Browse native workspace memories and synced provider translation memories with locale coverage, capabilities, and sync health in one place."
      />

      {memoriesQuery.isSuccess ? (
        <TranslationMemoriesMetrics memories={memories} total={memoryTotal} />
      ) : null}

      {memoriesQuery.isSuccess && memories.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              placeholder="Search by name, project, or external ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:max-w-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
              <SelectTrigger className="w-fit min-w-[8rem]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="native">Workspace</SelectItem>
                <SelectItem value="external_tms">Provider</SelectItem>
              </SelectContent>
            </Select>

            {hasExternalMemories && sourceFilter !== "native" ? (
              <Select
                value={providerFilter}
                onValueChange={(value) => setProviderFilter(value ?? "all")}
              >
                <SelectTrigger className="w-fit min-w-[8rem]">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All providers</SelectItem>
                  {providerKinds.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {providerLabel(kind)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {hasExternalMemories && sourceFilter !== "native" ? (
              <Select value={syncFilter} onValueChange={(value) => setSyncFilter(value ?? "all")}>
                <SelectTrigger className="w-fit min-w-[8rem]">
                  <SelectValue placeholder="Sync" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sync states</SelectItem>
                  <SelectItem value="synced">Synced</SelectItem>
                  <SelectItem value="stale">Stale</SelectItem>
                  <SelectItem value="syncing">Syncing</SelectItem>
                  <SelectItem value="error">Sync error</SelectItem>
                </SelectContent>
              </Select>
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

      <div className="flex items-center gap-2 text-sm text-foreground/54">
        <span>
          Provider memories stay read-only here. Connect or manage credentials from Integrations.
        </span>
        <Link
          href={`/org/${organizationSlug}/integrations`}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <span>Integrations</span>
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.7} className="size-4" />
        </Link>
      </div>

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
