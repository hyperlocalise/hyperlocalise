"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Add01Icon, DatabaseSyncIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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

type MemoryCreateForm = {
  name: string;
  description: string;
};

function createEmptyMemoryForm(): MemoryCreateForm {
  return { name: "", description: "" };
}

function readApiError(response: Response, fallback: string) {
  return response
    .json()
    .then((body) =>
      body && typeof body === "object" && "message" in body
        ? String(body.message)
        : body && typeof body === "object" && "error" in body
          ? String(body.error)
          : fallback,
    )
    .catch(() => fallback);
}

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

export function TranslationMemoriesPageContent({
  organizationSlug,
  canCreateMemories,
}: {
  organizationSlug: string;
  canCreateMemories: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<MemoryCreateForm>(() => createEmptyMemoryForm());
  const [createErrors, setCreateErrors] = useState<{ name?: string }>({});
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
  const createMemory = useMutation({
    mutationFn: async (values: MemoryCreateForm) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"].$post({
        param: { organizationSlug },
        json: {
          name: values.name.trim(),
          description: values.description.trim(),
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to create translation memory"));
      }

      return response.json();
    },
    onSuccess: async (body) => {
      await queryClient.invalidateQueries({ queryKey: ["translation-memories", organizationSlug] });
      setCreateDialogOpen(false);
      setCreateForm(createEmptyMemoryForm());
      toast.success("Translation memory created");
      router.push(`/org/${organizationSlug}/translation-memories/${body.memory.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
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
    ? "Provider translation memories appear here after sync. Connect or resync a TMS provider from Integrations if you expected to see one."
    : "Connect Crowdin, Phrase, Smartling, or Lokalise from Integrations to sync translation memories into this workspace.";

  const memoryCountLabel =
    memoriesQuery.isSuccess && memoryTotal > 0
      ? `${memoryTotal} ${memoryTotal === 1 ? "memory" : "memories"}`
      : undefined;

  function submitCreateMemory() {
    const errors: { name?: string } = {};
    if (!createForm.name.trim()) {
      errors.name = "Translation memory name is required.";
    }
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    createMemory.mutate(createForm);
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        icon={DatabaseSyncIcon}
        label="Workspace"
        title="Translation Memories"
        description="Create first-party workspace memories or sync provider translation memories. Provider memories stay read-only."
        statusLabel={memoryCountLabel}
        actions={
          canCreateMemories ? (
            <Button
              type="button"
              onClick={() => setCreateDialogOpen(true)}
              className="w-full sm:w-fit"
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
              Create memory
            </Button>
          ) : null
        }
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
        emptyTitle={canCreateMemories ? "No translation memories yet" : emptyTitle}
        emptyDescription={
          canCreateMemories
            ? "Create a workspace memory, import entries, then assign it to the projects that should use it."
            : emptyDescription
        }
        emptyAction={
          canCreateMemories ? (
            <Button type="button" size="sm" onClick={() => setCreateDialogOpen(true)}>
              Create memory
            </Button>
          ) : (
            <TranslationMemoriesEmptyAction organizationSlug={organizationSlug} />
          )
        }
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
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create translation memory</DialogTitle>
            <DialogDescription>
              Add a first-party memory library. You can import and edit entries after creation.
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
                disabled={createMemory.isPending}
                placeholder="Marketing launch memory"
              />
              <FieldError
                errors={createErrors.name ? [{ message: createErrors.name }] : undefined}
              />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel>Description</FieldLabel>
              <Textarea
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, description: event.target.value }))
                }
                disabled={createMemory.isPending}
                placeholder="When this memory should be used"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={createMemory.isPending}
            >
              Cancel
            </Button>
            <Button onClick={submitCreateMemory} disabled={createMemory.isPending}>
              {createMemory.isPending ? <Spinner /> : null}
              Create memory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
