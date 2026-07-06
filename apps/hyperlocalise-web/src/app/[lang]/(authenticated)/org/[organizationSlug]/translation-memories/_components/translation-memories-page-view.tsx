"use client";

import { Add01Icon, DatabaseSyncIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

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
import { TypographyP } from "@/components/ui/typography";

import { TmsLiveProjectPicker } from "../../_components/tms-live-project-picker";
import {
  PageHeader,
  WorkspaceFilterField,
  workspaceFilterTriggerClassName,
} from "../../_components/workspace-resource-shared";
import type { MemoryListRow } from "./memory-list";
import { providerLabel } from "./memory-list";
import {
  TranslationMemoriesEmptyAction,
  TranslationMemoriesTable,
} from "./translation-memories-table";

export const MEMORIES_PAGE_SIZE = 100;

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

export type MemoryCreateForm = {
  name: string;
  description: string;
};

export function TranslationMemoriesPageView({
  organizationSlug,
  memories,
  memoryTotal,
  isLoading,
  isError,
  isSuccess,
  error,
  allowCreateMemories,
  hasConnectedProvider,
  useLiveProviderMemories,
  selectedExternalProjectId,
  onSelectedExternalProjectIdChange,
  searchQuery,
  onSearchQueryChange,
  sourceFilter,
  onSourceFilterChange,
  providerFilter,
  onProviderFilterChange,
  syncFilter,
  onSyncFilterChange,
  providerKinds,
  hasExternalMemories,
  hasMemories,
  activeFilterCount,
  showNoFilterMatches,
  onClearFilters,
  page,
  totalPages,
  pageStart,
  pageEnd,
  onPageChange,
  createDialogOpen,
  onCreateDialogOpenChange,
  createForm,
  onCreateFormChange,
  createErrors,
  isCreating,
  onSubmitCreateMemory,
}: {
  organizationSlug: string;
  memories: MemoryListRow[];
  memoryTotal: number;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: Error | null;
  allowCreateMemories: boolean;
  hasConnectedProvider: boolean;
  useLiveProviderMemories: boolean;
  selectedExternalProjectId: string;
  onSelectedExternalProjectIdChange: (value: string) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  sourceFilter: string;
  onSourceFilterChange: (value: string) => void;
  providerFilter: string;
  onProviderFilterChange: (value: string) => void;
  syncFilter: string;
  onSyncFilterChange: (value: string) => void;
  providerKinds: string[];
  hasExternalMemories: boolean;
  hasMemories: boolean;
  activeFilterCount: number;
  showNoFilterMatches: boolean;
  onClearFilters: () => void;
  page: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  onPageChange: (page: number) => void;
  createDialogOpen: boolean;
  onCreateDialogOpenChange: (open: boolean) => void;
  createForm: MemoryCreateForm;
  onCreateFormChange: (form: MemoryCreateForm) => void;
  createErrors: { name?: string };
  isCreating: boolean;
  onSubmitCreateMemory: () => void;
}) {
  const liveProjectSelectionRequired = useLiveProviderMemories && !selectedExternalProjectId;

  const emptyTitle = hasConnectedProvider
    ? "No translation memories yet"
    : "Connect a TMS provider";
  const emptyDescription = hasConnectedProvider
    ? "Provider translation memories appear here after sync. Connect or resync a TMS provider from Integrations if you expected to see one."
    : "Connect Crowdin, Phrase, Smartling, or Lokalise from Integrations to sync translation memories into this workspace.";

  const memoryCountLabel =
    isSuccess && memoryTotal > 0
      ? `${memoryTotal} ${memoryTotal === 1 ? "memory" : "memories"}`
      : undefined;

  const memoriesQuery = { isLoading, isError, isSuccess, error };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        icon={DatabaseSyncIcon}
        label="Workspace"
        title="Translation Memories"
        description="Create first-party workspace memories or sync provider translation memories. Provider memories stay read-only."
        statusLabel={memoryCountLabel}
        actions={
          allowCreateMemories ? (
            <Button
              type="button"
              onClick={() => onCreateDialogOpenChange(true)}
              className="w-full sm:w-fit"
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
              Create memory
            </Button>
          ) : null
        }
      />

      {useLiveProviderMemories ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-2">
          <TmsLiveProjectPicker
            organizationSlug={organizationSlug}
            value={selectedExternalProjectId}
            onValueChange={onSelectedExternalProjectIdChange}
          />
        </div>
      ) : null}

      {isSuccess && hasMemories ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-2">
          <WorkspaceFilterField label="Search" className="w-full sm:max-w-xs">
            <Input
              placeholder="Name, project, or external ID..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="w-full"
            />
          </WorkspaceFilterField>
          <WorkspaceFilterField label="Source" className="w-full sm:w-40">
            <Select
              value={sourceFilter}
              onValueChange={(value) => {
                onSourceFilterChange(value ?? "all");
                if (value === "native") {
                  onProviderFilterChange("all");
                  onSyncFilterChange("all");
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
                onValueChange={(value) => onProviderFilterChange(value ?? "all")}
              >
                <SelectTrigger className={workspaceFilterTriggerClassName}>
                  <SelectValue>
                    {providerFilter === "all" ? "All providers" : providerLabel(providerFilter)}
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
              <Select
                value={syncFilter}
                onValueChange={(value) => onSyncFilterChange(value ?? "all")}
              >
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
            <Button type="button" variant="ghost" size="sm" onClick={onClearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}

      {showNoFilterMatches ? (
        <div className="text-sm text-muted-foreground">
          No translation memories match your filters.{" "}
          <button
            type="button"
            onClick={onClearFilters}
            className="text-subtle-foreground underline hover:text-foreground"
          >
            Clear filters
          </button>
        </div>
      ) : null}

      {liveProjectSelectionRequired ? (
        <div className="space-y-3 py-10">
          <TypographyP className="text-sm font-medium text-foreground">
            Choose a TMS project
          </TypographyP>
          <TypographyP className="max-w-xl text-sm leading-6 text-muted-foreground">
            Select a project above to load live translation memories from your connected provider.
          </TypographyP>
        </div>
      ) : (
        <TranslationMemoriesTable
          memories={memories}
          memoriesQuery={memoriesQuery}
          organizationSlug={organizationSlug}
          emptyTitle={allowCreateMemories ? "No translation memories yet" : emptyTitle}
          emptyDescription={
            allowCreateMemories
              ? "Create a workspace memory, import entries, then assign it to the projects that should use it."
              : emptyDescription
          }
          emptyAction={
            allowCreateMemories ? (
              <Button type="button" size="sm" onClick={() => onCreateDialogOpenChange(true)}>
                Create memory
              </Button>
            ) : (
              <TranslationMemoriesEmptyAction organizationSlug={organizationSlug} />
            )
          }
        />
      )}

      {!liveProjectSelectionRequired && isSuccess && memoryTotal > MEMORIES_PAGE_SIZE ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Showing {pageStart}–{pageEnd} of {memoryTotal} translation memories
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              Previous
            </Button>
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={createDialogOpen} onOpenChange={onCreateDialogOpenChange}>
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
                  onCreateFormChange({ ...createForm, name: event.target.value })
                }
                disabled={isCreating}
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
                  onCreateFormChange({ ...createForm, description: event.target.value })
                }
                disabled={isCreating}
                placeholder="When this memory should be used"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onCreateDialogOpenChange(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button onClick={onSubmitCreateMemory} disabled={isCreating}>
              {isCreating ? <Spinner /> : null}
              Create memory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
