"use client";

import { Add01Icon, DatabaseSyncIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

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
import { translationMemoriesPageViewMessages } from "./translation-memories-page-view.messages";

export const MEMORIES_PAGE_SIZE = 100;

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
  const intl = useIntl();
  const liveProjectSelectionRequired = useLiveProviderMemories && !selectedExternalProjectId;

  const sourceFilterLabels = {
    all: intl.formatMessage(translationMemoriesPageViewMessages.sourceAll),
    native: intl.formatMessage(translationMemoriesPageViewMessages.sourceNative),
    external_tms: intl.formatMessage(translationMemoriesPageViewMessages.sourceExternalTms),
  } as const;

  const syncFilterLabels = {
    all: intl.formatMessage(translationMemoriesPageViewMessages.syncAll),
    synced: intl.formatMessage(translationMemoriesPageViewMessages.syncSynced),
    stale: intl.formatMessage(translationMemoriesPageViewMessages.syncStale),
    syncing: intl.formatMessage(translationMemoriesPageViewMessages.syncSyncing),
    error: intl.formatMessage(translationMemoriesPageViewMessages.syncError),
  } as const;

  const emptyTitle = hasConnectedProvider
    ? intl.formatMessage(translationMemoriesPageViewMessages.emptyTitle)
    : intl.formatMessage(translationMemoriesPageViewMessages.emptyTitleConnectProvider);
  const emptyDescription = hasConnectedProvider
    ? intl.formatMessage(translationMemoriesPageViewMessages.emptyDescriptionWithProvider)
    : intl.formatMessage(translationMemoriesPageViewMessages.emptyDescriptionWithoutProvider);

  const memoryCountLabel =
    isSuccess && memoryTotal > 0
      ? intl.formatMessage(translationMemoriesPageViewMessages.memoryCount, {
          count: memoryTotal,
        })
      : undefined;

  const memoriesQuery = { isLoading, isError, isSuccess, error };
  const allProvidersLabel = intl.formatMessage(translationMemoriesPageViewMessages.providerAll);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        icon={DatabaseSyncIcon}
        label={intl.formatMessage(translationMemoriesPageViewMessages.pageLabel)}
        title={intl.formatMessage(translationMemoriesPageViewMessages.pageTitle)}
        description={intl.formatMessage(translationMemoriesPageViewMessages.pageDescription)}
        statusLabel={memoryCountLabel}
        actions={
          allowCreateMemories ? (
            <Button
              type="button"
              onClick={() => onCreateDialogOpenChange(true)}
              className="w-full sm:w-fit"
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
              <FormattedMessage {...translationMemoriesPageViewMessages.createMemory} />
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
          <WorkspaceFilterField
            label={intl.formatMessage(translationMemoriesPageViewMessages.searchLabel)}
            className="w-full sm:max-w-xs"
          >
            <Input
              placeholder={intl.formatMessage(
                translationMemoriesPageViewMessages.searchPlaceholder,
              )}
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="w-full"
            />
          </WorkspaceFilterField>
          <WorkspaceFilterField
            label={intl.formatMessage(translationMemoriesPageViewMessages.sourceLabel)}
            className="w-full sm:w-40"
          >
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
            <WorkspaceFilterField
              label={intl.formatMessage(translationMemoriesPageViewMessages.providerLabel)}
              className="w-full sm:w-40"
            >
              <Select
                value={providerFilter}
                onValueChange={(value) => onProviderFilterChange(value ?? "all")}
              >
                <SelectTrigger className={workspaceFilterTriggerClassName}>
                  <SelectValue>
                    {providerFilter === "all" ? allProvidersLabel : providerLabel(providerFilter)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" label={allProvidersLabel}>
                    {allProvidersLabel}
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

          {hasExternalMemories && sourceFilter !== "native" && !useLiveProviderMemories ? (
            <WorkspaceFilterField
              label={intl.formatMessage(translationMemoriesPageViewMessages.syncLabel)}
              className="w-full sm:w-40"
            >
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
              <FormattedMessage {...translationMemoriesPageViewMessages.clearFilters} />
            </Button>
          ) : null}
        </div>
      ) : null}

      {showNoFilterMatches ? (
        <div className="text-sm text-muted-foreground">
          <FormattedMessage
            {...translationMemoriesPageViewMessages.noFilterMatches}
            values={{
              clear: (chunks) => (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="text-subtle-foreground underline hover:text-foreground"
                >
                  {chunks}
                </button>
              ),
            }}
          />
        </div>
      ) : null}

      {liveProjectSelectionRequired ? (
        <div className="space-y-3 py-10">
          <TypographyP className="text-sm font-medium text-foreground">
            <FormattedMessage {...translationMemoriesPageViewMessages.chooseTmsProjectTitle} />
          </TypographyP>
          <TypographyP className="max-w-xl text-sm leading-6 text-muted-foreground">
            <FormattedMessage
              {...translationMemoriesPageViewMessages.chooseTmsProjectDescription}
            />
          </TypographyP>
        </div>
      ) : (
        <TranslationMemoriesTable
          memories={memories}
          memoriesQuery={memoriesQuery}
          organizationSlug={organizationSlug}
          emptyTitle={
            allowCreateMemories
              ? intl.formatMessage(translationMemoriesPageViewMessages.emptyTitle)
              : emptyTitle
          }
          emptyDescription={
            allowCreateMemories
              ? intl.formatMessage(translationMemoriesPageViewMessages.emptyDescriptionCreate)
              : emptyDescription
          }
          emptyAction={
            allowCreateMemories ? (
              <Button type="button" size="sm" onClick={() => onCreateDialogOpenChange(true)}>
                <FormattedMessage {...translationMemoriesPageViewMessages.createMemory} />
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
            <FormattedMessage
              {...translationMemoriesPageViewMessages.paginationSummary}
              values={{ pageStart, pageEnd, memoryTotal }}
            />
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              <FormattedMessage {...translationMemoriesPageViewMessages.previousPage} />
            </Button>
            <p className="text-sm text-muted-foreground">
              <FormattedMessage
                {...translationMemoriesPageViewMessages.paginationPage}
                values={{ page, totalPages }}
              />
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <FormattedMessage {...translationMemoriesPageViewMessages.nextPage} />
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={createDialogOpen} onOpenChange={onCreateDialogOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...translationMemoriesPageViewMessages.createDialogTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...translationMemoriesPageViewMessages.createDialogDescription} />
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field className="gap-1.5">
              <FieldLabel>
                <FormattedMessage {...translationMemoriesPageViewMessages.nameLabel} />
              </FieldLabel>
              <Input
                value={createForm.name}
                onChange={(event) =>
                  onCreateFormChange({ ...createForm, name: event.target.value })
                }
                disabled={isCreating}
                placeholder={intl.formatMessage(
                  translationMemoriesPageViewMessages.namePlaceholder,
                )}
              />
              <FieldError
                errors={createErrors.name ? [{ message: createErrors.name }] : undefined}
              />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel>
                <FormattedMessage {...translationMemoriesPageViewMessages.descriptionLabel} />
              </FieldLabel>
              <Textarea
                value={createForm.description}
                onChange={(event) =>
                  onCreateFormChange({ ...createForm, description: event.target.value })
                }
                disabled={isCreating}
                placeholder={intl.formatMessage(
                  translationMemoriesPageViewMessages.descriptionPlaceholder,
                )}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onCreateDialogOpenChange(false)}
              disabled={isCreating}
            >
              <FormattedMessage {...translationMemoriesPageViewMessages.cancel} />
            </Button>
            <Button onClick={onSubmitCreateMemory} disabled={isCreating}>
              {isCreating ? <Spinner /> : null}
              <FormattedMessage {...translationMemoriesPageViewMessages.createMemory} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
