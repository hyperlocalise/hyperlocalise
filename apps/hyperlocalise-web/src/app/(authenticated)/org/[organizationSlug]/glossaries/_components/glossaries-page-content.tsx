"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight01Icon, BookOpenTextIcon } from "@hugeicons/core-free-icons";
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

import { MetricsGrid, PageHeader } from "../../_components/workspace-resource-shared";
import {
  buildProjectIdByExternalKey,
  mapGlossaryToListRow,
  providerLabel,
  type ApiGlossary,
  type GlossaryListRow,
} from "./glossary-list";
import { GlossariesEmptyAction, GlossariesTable } from "./glossaries-table";

const GLOSSARIES_PAGE_SIZE = 100;

const glossariesQueryKey = (organizationSlug: string, page: number) => [
  "glossaries",
  organizationSlug,
  page,
];
const projectsQueryKey = (organizationSlug: string) => ["glossary-projects", organizationSlug];
const credentialsQueryKey = (organizationSlug: string) => [
  "glossary-credentials",
  organizationSlug,
];

function useGlossaryFilters(glossaries: GlossaryListRow[]) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string>("all");
  const [syncFilter, setSyncFilter] = useState<string>("all");

  const filteredGlossaries = useMemo(() => {
    return glossaries.filter((glossary) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = glossary.name.toLowerCase().includes(query);
        const matchesProject = glossary.externalProjectId?.toLowerCase().includes(query);
        const matchesGlossaryId = glossary.externalGlossaryId?.toLowerCase().includes(query);
        if (!matchesName && !matchesProject && !matchesGlossaryId) return false;
      }

      if (sourceFilter !== "all" && glossary.source !== sourceFilter) return false;

      if (providerFilter !== "all") {
        if (glossary.externalProviderKind !== providerFilter) return false;
      }

      if (resourceTypeFilter !== "all") {
        if (glossary.externalResourceType !== resourceTypeFilter) return false;
      }

      if (syncFilter !== "all") {
        if (syncFilter === "error") {
          if (!glossary.lastSyncErrorAt) return false;
        } else if (glossary.syncState !== syncFilter) {
          return false;
        }
      }

      return true;
    });
  }, [glossaries, searchQuery, sourceFilter, providerFilter, resourceTypeFilter, syncFilter]);

  const activeFilterCount = [sourceFilter, providerFilter, resourceTypeFilter, syncFilter].filter(
    (f) => f !== "all",
  ).length;

  return {
    searchQuery,
    setSearchQuery,
    sourceFilter,
    setSourceFilter,
    providerFilter,
    setProviderFilter,
    resourceTypeFilter,
    setResourceTypeFilter,
    syncFilter,
    setSyncFilter,
    filteredGlossaries,
    activeFilterCount,
  };
}

function GlossariesMetrics({
  glossaries,
  total,
}: {
  glossaries: GlossaryListRow[];
  total: number;
}) {
  const metrics = useMemo(() => {
    const providerGlossaries = glossaries.filter((glossary) => glossary.source === "external_tms");
    const syncedCount = providerGlossaries.filter(
      (glossary) => glossary.syncState === "synced" && !glossary.lastSyncErrorAt,
    ).length;
    const errorCount = providerGlossaries.filter((glossary) => glossary.lastSyncErrorAt).length;
    const localeCount = new Set(glossaries.flatMap((glossary) => glossary.localeCoverage)).size;
    const termTotal = glossaries.reduce((sum, glossary) => sum + (glossary.termCount ?? 0), 0);
    const termLabel =
      termTotal >= 1_000_000
        ? `${(termTotal / 1_000_000).toFixed(1)}M`
        : termTotal >= 1_000
          ? `${(termTotal / 1_000).toFixed(1)}k`
          : `${termTotal}`;
    const providerCountOnPage = providerGlossaries.length;
    const providerDetail =
      total > glossaries.length
        ? `${providerCountOnPage} provider on this page`
        : `${providerCountOnPage} provider`;

    return [
      {
        label: "Terminology resources",
        value: `${total}`,
        detail: providerDetail,
        tone: "info" as const,
      },
      {
        label: "Locales covered",
        value: `${localeCount}`,
        detail: `${termLabel} terms on page`,
        tone: "safe" as const,
      },
      {
        label: "Sync health",
        value: `${syncedCount}`,
        detail: errorCount > 0 ? `${errorCount} errors` : "healthy",
        tone: errorCount > 0 ? ("watch" as const) : ("safe" as const),
      },
    ] as const;
  }, [glossaries, total]);

  return <MetricsGrid metrics={metrics} />;
}

export function GlossariesPageContent({ organizationSlug }: { organizationSlug: string }) {
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

  const glossariesQuery = useQuery({
    queryKey: glossariesQueryKey(organizationSlug, page),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries.$get({
        param: { organizationSlug },
        query: {
          limit: String(GLOSSARIES_PAGE_SIZE),
          offset: String((page - 1) * GLOSSARIES_PAGE_SIZE),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load glossaries (${response.status})`);
      }

      const body = await response.json();
      return {
        glossaries: body.glossaries as ApiGlossary[],
        total: body.total as number,
      };
    },
  });

  const projectIdByExternalKey = useMemo(
    () => buildProjectIdByExternalKey(projectsQuery.data ?? []),
    [projectsQuery.data],
  );

  const glossaries = useMemo(
    () =>
      (glossariesQuery.data?.glossaries ?? []).map((glossary) =>
        mapGlossaryToListRow(glossary, projectIdByExternalKey),
      ),
    [glossariesQuery.data?.glossaries, projectIdByExternalKey],
  );

  const glossaryTotal = glossariesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(glossaryTotal / GLOSSARIES_PAGE_SIZE));
  const pageStart = glossaryTotal === 0 ? 0 : (page - 1) * GLOSSARIES_PAGE_SIZE + 1;
  const pageEnd = Math.min(page * GLOSSARIES_PAGE_SIZE, glossaryTotal);

  const providerKinds = useMemo(() => {
    const kinds = new Set<string>();
    for (const glossary of glossaries) {
      if (glossary.externalProviderKind) {
        kinds.add(glossary.externalProviderKind);
      }
    }
    return [...kinds].sort((a, b) => providerLabel(a).localeCompare(providerLabel(b)));
  }, [glossaries]);

  const hasResourceTypes = glossaries.some((glossary) => glossary.externalResourceType);

  const {
    searchQuery,
    setSearchQuery,
    sourceFilter,
    setSourceFilter,
    providerFilter,
    setProviderFilter,
    resourceTypeFilter,
    setResourceTypeFilter,
    syncFilter,
    setSyncFilter,
    filteredGlossaries,
    activeFilterCount,
  } = useGlossaryFilters(glossaries);

  useEffect(() => {
    setPage(1);
  }, [organizationSlug, searchQuery, sourceFilter, providerFilter, resourceTypeFilter, syncFilter]);

  useEffect(() => {
    if (glossariesQuery.isSuccess && page > totalPages) {
      setPage(totalPages);
    }
  }, [glossariesQuery.isSuccess, page, totalPages]);

  const hasExternalGlossaries = glossaries.some((glossary) => glossary.source === "external_tms");
  const connectedCredentials = (credentialsQuery.data ?? []).filter(
    (credential) => credential.validationStatus === "connected",
  );
  const hasConnectedProvider = credentialsQuery.isSuccess && connectedCredentials.length > 0;

  const emptyTitle = hasConnectedProvider ? "No glossaries yet" : "Connect a TMS provider";
  const emptyDescription = hasConnectedProvider
    ? "Provider glossaries and term bases appear here after sync. Native workspace glossaries are listed alongside synced resources."
    : "Connect Crowdin, Phrase, Smartling, or Lokalise from Integrations to sync terminology into this workspace.";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeader
        icon={BookOpenTextIcon}
        label="Term library"
        title="Glossaries"
        description="Browse native workspace glossaries and synced provider glossaries or term bases with locale coverage, term capabilities, and sync health in one place."
      />

      {glossariesQuery.isSuccess ? (
        <GlossariesMetrics glossaries={glossaries} total={glossaryTotal} />
      ) : null}

      {glossariesQuery.isSuccess && glossaries.length > 0 ? (
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
                  setResourceTypeFilter("all");
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

            {hasExternalGlossaries && sourceFilter !== "native" ? (
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

            {hasResourceTypes && sourceFilter !== "native" ? (
              <Select
                value={resourceTypeFilter}
                onValueChange={(value) => setResourceTypeFilter(value ?? "all")}
              >
                <SelectTrigger className="w-fit min-w-[8rem]">
                  <SelectValue placeholder="Resource" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All resource types</SelectItem>
                  <SelectItem value="glossary">Glossary</SelectItem>
                  <SelectItem value="term_base">Term base</SelectItem>
                </SelectContent>
              </Select>
            ) : null}

            {hasExternalGlossaries && sourceFilter !== "native" ? (
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
                  setResourceTypeFilter("all");
                  setSyncFilter("all");
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {glossariesQuery.isSuccess && glossaries.length > 0 && filteredGlossaries.length === 0 ? (
        <div className="text-sm text-foreground/52">
          No glossaries match your filters.{" "}
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSourceFilter("all");
              setProviderFilter("all");
              setResourceTypeFilter("all");
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
          Provider terminology stays read-only here. Connect or manage credentials from
          Integrations.
        </span>
        <Link
          href={`/org/${organizationSlug}/integrations`}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <span>Integrations</span>
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.7} className="size-4" />
        </Link>
      </div>

      <GlossariesTable
        glossaries={filteredGlossaries}
        glossariesQuery={glossariesQuery}
        organizationSlug={organizationSlug}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        emptyAction={<GlossariesEmptyAction organizationSlug={organizationSlug} />}
      />

      {glossariesQuery.isSuccess && glossaryTotal > GLOSSARIES_PAGE_SIZE ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-foreground/52">
            Showing {pageStart}–{pageEnd} of {glossaryTotal} glossaries
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
