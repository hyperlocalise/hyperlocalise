"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { Add01Icon, BookOpenTextIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { isTmsProviderShellModeEnabled } from "@/lib/providers/tms-provider-shell-mode";

import { useActiveTmsProvider } from "../../_hooks/use-active-tms-provider";

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
  mapGlossaryToListRow,
  mapLiveTmsProviderGlossaryToListRow,
  providerLabel,
  type ApiGlossary,
  type GlossaryListRow,
} from "./glossary-list";
import type { TmsProviderLiveGlossary } from "@/lib/providers/tms-provider-live";
import { GlossariesEmptyAction, GlossariesTable } from "./glossaries-table";
import {
  ProjectSourceLocalePicker,
  ProjectTargetLocalesPicker,
} from "../../projects/_components/project-locale-picker";

const GLOSSARIES_PAGE_SIZE = 100;

const sourceFilterLabels = {
  all: "All sources",
  native: "Workspace",
  external_tms: "Provider",
} as const;

const resourceTypeFilterLabels = {
  all: "All resource types",
  glossary: "Glossary",
  term_base: "Term base",
} as const;

const syncFilterLabels = {
  all: "All sync states",
  synced: "Synced",
  stale: "Stale",
  syncing: "Syncing",
  error: "Sync error",
} as const;

type GlossaryListFilters = {
  searchQuery: string;
  sourceFilter: string;
  providerFilter: string;
  resourceTypeFilter: string;
  syncFilter: string;
};

const glossariesQueryKey = (
  organizationSlug: string,
  page: number,
  filters: GlossaryListFilters,
) => ["glossaries", organizationSlug, page, filters];

function buildGlossaryListQuery(page: number, filters: GlossaryListFilters) {
  const query: {
    limit: string;
    offset: string;
    search?: string;
    source?: "native" | "external_tms";
    provider?: "crowdin" | "smartling" | "phrase" | "lokalise";
    resourceType?: "glossary" | "term_base";
    sync?: "synced" | "stale" | "syncing" | "error";
  } = {
    limit: String(GLOSSARIES_PAGE_SIZE),
    offset: String((page - 1) * GLOSSARIES_PAGE_SIZE),
  };

  const search = filters.searchQuery.trim();
  if (search) {
    query.search = search;
  }
  if (filters.sourceFilter === "native" || filters.sourceFilter === "external_tms") {
    query.source = filters.sourceFilter;
  }
  if (
    filters.providerFilter === "crowdin" ||
    filters.providerFilter === "smartling" ||
    filters.providerFilter === "phrase" ||
    filters.providerFilter === "lokalise"
  ) {
    query.provider = filters.providerFilter;
  }
  if (filters.resourceTypeFilter === "glossary" || filters.resourceTypeFilter === "term_base") {
    query.resourceType = filters.resourceTypeFilter;
  }
  if (
    filters.syncFilter === "synced" ||
    filters.syncFilter === "stale" ||
    filters.syncFilter === "syncing" ||
    filters.syncFilter === "error"
  ) {
    query.sync = filters.syncFilter;
  }

  return query;
}
const projectsQueryKey = (organizationSlug: string) => ["glossary-projects", organizationSlug];
const credentialsQueryKey = (organizationSlug: string) => [
  "glossary-credentials",
  organizationSlug,
];

type GlossaryCreateForm = {
  name: string;
  description: string;
  sourceLocale: string;
  targetLocales: string[];
};

function createEmptyGlossaryForm(): GlossaryCreateForm {
  return {
    name: "",
    description: "",
    sourceLocale: "en-US",
    targetLocales: ["fr-FR"],
  };
}

function useGlossaryFilters(searchParams: URLSearchParams) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState(() =>
    readWorkspaceFilterParam(searchParams, "source", PROJECT_SOURCE_FILTERS),
  );
  const [providerFilter, setProviderFilter] = useState(() =>
    readWorkspaceFilterParam(searchParams, "provider", TMS_PROVIDER_KINDS),
  );
  const [resourceTypeFilter, setResourceTypeFilter] = useState(() =>
    readWorkspaceFilterParam(searchParams, "resourceType", ["glossary", "term_base"]),
  );
  const [syncFilter, setSyncFilter] = useState(() =>
    readWorkspaceFilterParam(searchParams, "sync", GLOSSARY_SYNC_FILTERS),
  );

  const filters = useMemo(
    () => ({
      searchQuery,
      sourceFilter,
      providerFilter,
      resourceTypeFilter,
      syncFilter,
    }),
    [searchQuery, sourceFilter, providerFilter, resourceTypeFilter, syncFilter],
  );

  const activeFilterCount = [
    searchQuery.trim() ? "search" : null,
    sourceFilter,
    providerFilter,
    resourceTypeFilter,
    syncFilter,
  ].filter((value) => value && value !== "all").length;

  const hasActiveFilters = activeFilterCount > 0;

  return {
    filters,
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
    activeFilterCount,
    hasActiveFilters,
  };
}

export function GlossariesPageContent({
  organizationSlug,
  canCreateGlossaries,
}: {
  organizationSlug: string;
  canCreateGlossaries: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<GlossaryCreateForm>(() => createEmptyGlossaryForm());
  const [createErrors, setCreateErrors] = useState<{ name?: string; targetLocales?: string }>({});
  const {
    filters,
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
    activeFilterCount,
    hasActiveFilters,
  } = useGlossaryFilters(searchParams);
  const { data: activeTmsProvider } = useActiveTmsProvider(organizationSlug);
  const useLiveProviderGlossaries = isTmsProviderShellModeEnabled() && Boolean(activeTmsProvider);
  const allowCreateGlossaries = canCreateGlossaries && !useLiveProviderGlossaries;

  const projectsQuery = useQuery({
    queryKey: projectsQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });

      if (response.status !== 200) {
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
    queryKey: [
      ...glossariesQueryKey(organizationSlug, page, filters),
      useLiveProviderGlossaries ? "live" : "native",
    ],
    queryFn: async () => {
      if (useLiveProviderGlossaries && activeTmsProvider) {
        const response = await apiClient.api.orgs[":organizationSlug"][
          "tms-provider"
        ].glossaries.$get({
          param: { organizationSlug },
          query: {},
        });

        if (!response.ok) {
          throw new Error(`Failed to load provider glossaries (${response.status})`);
        }

        const body = (await response.json()) as { glossaries: TmsProviderLiveGlossary[] };
        const rows = body.glossaries.map((glossary: TmsProviderLiveGlossary) =>
          mapLiveTmsProviderGlossaryToListRow(glossary, activeTmsProvider.providerKind),
        );
        const normalizedSearch = filters.searchQuery.trim().toLowerCase();
        const filtered = rows.filter((row: GlossaryListRow) => {
          if (normalizedSearch) {
            const haystack = [row.name, row.description, row.id].join(" ").toLowerCase();
            if (!haystack.includes(normalizedSearch)) return false;
          }
          if (filters.sourceFilter !== "all" && row.source !== filters.sourceFilter) {
            return false;
          }
          if (
            filters.providerFilter !== "all" &&
            row.externalProviderKind !== filters.providerFilter
          ) {
            return false;
          }
          return true;
        });

        return {
          glossaries: [] as ApiGlossary[],
          liveRows: filtered,
          total: filtered.length,
        };
      }

      const response = await apiClient.api.orgs[":organizationSlug"].glossaries.$get({
        param: { organizationSlug },
        query: buildGlossaryListQuery(page, filters),
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
  const createGlossary = useMutation({
    mutationFn: async (values: GlossaryCreateForm) => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries.$post({
        param: { organizationSlug },
        json: {
          name: values.name.trim(),
          description: values.description.trim(),
          sourceLocale: values.sourceLocale,
          targetLocale: values.targetLocales[0] ?? "",
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to create glossary"));
      }

      return response.json();
    },
    onSuccess: async (body) => {
      await queryClient.invalidateQueries({ queryKey: ["glossaries", organizationSlug] });
      setCreateDialogOpen(false);
      setCreateForm(createEmptyGlossaryForm());
      toast.success("Glossary created");
      router.push(`/org/${organizationSlug}/glossaries/${body.glossary.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const projectIdByExternalKey = useMemo(
    () => buildProjectIdByExternalKey(projectsQuery.data ?? []),
    [projectsQuery.data],
  );

  const glossaries = useMemo(() => {
    if (useLiveProviderGlossaries) {
      return glossariesQuery.data?.liveRows ?? [];
    }

    return (glossariesQuery.data?.glossaries ?? []).map((glossary) =>
      mapGlossaryToListRow(glossary, projectIdByExternalKey),
    );
  }, [
    glossariesQuery.data?.glossaries,
    glossariesQuery.data?.liveRows,
    projectIdByExternalKey,
    useLiveProviderGlossaries,
  ]);

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

  useEffect(() => {
    setPage(1);
  }, [organizationSlug, filters]);

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
    ? "Provider glossaries and term bases appear here after sync. Connect or resync a TMS provider from Integrations if you expected to see one."
    : "Connect Crowdin, Phrase, Smartling, or Lokalise from Integrations to sync glossaries into this workspace.";

  const glossaryCountLabel =
    glossariesQuery.isSuccess && glossaryTotal > 0
      ? `${glossaryTotal} ${glossaryTotal === 1 ? "glossary" : "glossaries"}`
      : undefined;

  function submitCreateGlossary() {
    const errors: { name?: string; targetLocales?: string } = {};
    if (!createForm.name.trim()) {
      errors.name = "Glossary name is required.";
    }
    if (createForm.targetLocales.length === 0) {
      errors.targetLocales = "Select one target locale.";
    }
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    createGlossary.mutate(createForm);
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        icon={BookOpenTextIcon}
        label="Workspace"
        title="Glossaries"
        description="Create first-party workspace glossaries or sync provider term bases. Provider glossaries stay read-only."
        statusLabel={glossaryCountLabel}
        actions={
          allowCreateGlossaries ? (
            <Button
              type="button"
              onClick={() => setCreateDialogOpen(true)}
              className="w-full sm:w-fit"
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
              Create glossary
            </Button>
          ) : null
        }
      />

      {glossariesQuery.isSuccess && (glossaryTotal > 0 || hasActiveFilters) ? (
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
                  setResourceTypeFilter("all");
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

          {hasExternalGlossaries && sourceFilter !== "native" ? (
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

          {hasResourceTypes && sourceFilter !== "native" ? (
            <WorkspaceFilterField label="Resource" className="w-full sm:w-44">
              <Select
                value={resourceTypeFilter}
                onValueChange={(value) => setResourceTypeFilter(value ?? "all")}
              >
                <SelectTrigger className={workspaceFilterTriggerClassName}>
                  <SelectValue>
                    {resourceTypeFilterLabels[
                      resourceTypeFilter as keyof typeof resourceTypeFilterLabels
                    ] ?? resourceTypeFilter}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" label={resourceTypeFilterLabels.all}>
                    {resourceTypeFilterLabels.all}
                  </SelectItem>
                  <SelectItem value="glossary" label={resourceTypeFilterLabels.glossary}>
                    {resourceTypeFilterLabels.glossary}
                  </SelectItem>
                  <SelectItem value="term_base" label={resourceTypeFilterLabels.term_base}>
                    {resourceTypeFilterLabels.term_base}
                  </SelectItem>
                </SelectContent>
              </Select>
            </WorkspaceFilterField>
          ) : null}

          {hasExternalGlossaries && sourceFilter !== "native" ? (
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
                setResourceTypeFilter("all");
                setSyncFilter("all");
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}

      {glossariesQuery.isSuccess && hasActiveFilters && glossaryTotal === 0 ? (
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

      <GlossariesTable
        glossaries={glossaries}
        glossariesQuery={glossariesQuery}
        organizationSlug={organizationSlug}
        emptyTitle={allowCreateGlossaries ? "No glossaries yet" : emptyTitle}
        emptyDescription={
          allowCreateGlossaries
            ? "Create a workspace glossary, import terms, then assign it to the projects that should use it."
            : emptyDescription
        }
        emptyAction={
          allowCreateGlossaries ? (
            <Button type="button" size="sm" onClick={() => setCreateDialogOpen(true)}>
              Create glossary
            </Button>
          ) : (
            <GlossariesEmptyAction organizationSlug={organizationSlug} />
          )
        }
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
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-h-[min(85dvh,42rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create glossary</DialogTitle>
            <DialogDescription>
              Add a first-party terminology library. You can import and edit terms after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field className="gap-1.5">
              <FieldLabel>Name</FieldLabel>
              <Input
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, name: event.target.value }))
                }
                disabled={createGlossary.isPending}
                placeholder="Product terminology"
              />
              <FieldError
                errors={createErrors.name ? [{ message: createErrors.name }] : undefined}
              />
            </Field>
            <ProjectSourceLocalePicker
              value={createForm.sourceLocale}
              onChange={(sourceLocale) =>
                setCreateForm((current) => ({ ...current, sourceLocale }))
              }
              disabled={createGlossary.isPending}
            />
            <ProjectTargetLocalesPicker
              value={createForm.targetLocales}
              sourceLocale={createForm.sourceLocale}
              onChange={(targetLocales) =>
                setCreateForm((current) => ({
                  ...current,
                  targetLocales: targetLocales.slice(0, 1),
                }))
              }
              disabled={createGlossary.isPending}
              error={createErrors.targetLocales}
            />
            <Field className="gap-1.5">
              <FieldLabel>Description</FieldLabel>
              <Textarea
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, description: event.target.value }))
                }
                disabled={createGlossary.isPending}
                placeholder="Where this glossary should be used"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={createGlossary.isPending}
            >
              Cancel
            </Button>
            <Button onClick={submitCreateGlossary} disabled={createGlossary.isPending}>
              {createGlossary.isPending ? <Spinner /> : null}
              Create glossary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
