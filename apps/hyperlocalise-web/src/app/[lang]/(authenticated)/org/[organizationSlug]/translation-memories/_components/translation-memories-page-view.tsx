"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { PlusIcon, DatabaseIcon, UploadSimpleIcon } from "@phosphor-icons/react";
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

import {
  memoryImportFormatFromFilename,
  suggestedMemoryNameFromFilename,
} from "@/lib/memory/decode-import-file";

import { TmsLiveProjectPicker } from "../../_components/tms-live-project-picker";
import { groupByTmsProvider } from "../../_components/tms-resource-groups";
import { WorkspaceGroupedTable } from "../../_components/workspace-grouped-table";
import {
  PageHeader,
  WorkspaceFilterField,
  workspaceFilterTriggerClassName,
  WorkspacePageShell,
} from "../../_components/workspace-resource-shared";
import type { MemoryListRow } from "./memory-list";
import { providerLabel } from "./memory-list";
import {
  renderMemoryTableCells,
  TranslationMemoriesEmptyAction,
  useTranslationMemoriesTableColumns,
  type TranslationMemoriesTableQuery,
} from "./translation-memories-table";
import { translationMemoriesPageViewMessages } from "./translation-memories-page-view.messages";

export const MEMORIES_PAGE_SIZE = 100;

export type MemoryCreateForm = {
  name: string;
  description: string;
  importFile: File | null;
};

export function TranslationMemoriesPageView({
  organizationSlug,
  nativeMemories,
  externalMemories,
  nativeTotal,
  externalTotal: _externalTotal,
  nativeQuery,
  externalQuery,
  allowCreateMemories,
  hasConnectedProvider,
  useLiveProviderMemories,
  connectedProviderKinds,
  selectedExternalProjectId,
  onSelectedExternalProjectIdChange,
  searchQuery,
  onSearchQueryChange,
  sourceFilter,
  onSourceFilterChange,
  projectFilter,
  onProjectFilterChange,
  projects,
  providerFilter,
  onProviderFilterChange,
  syncFilter,
  onSyncFilterChange,
  providerKinds,
  hasExternalMemories,
  hasMemories,
  showNoFilterMatches,
  hasActiveFilters,
  onClearFilters,
  nativeHasMore,
  nativeIsLoadingMore,
  onNativeLoadMore,
  externalHasMore,
  externalIsLoadingMore,
  onExternalLoadMore,
  createDialogOpen,
  onCreateDialogOpenChange,
  createForm,
  onCreateFormChange,
  createErrors,
  isCreating,
  onSubmitCreateMemory,
  onImportMemory,
}: {
  organizationSlug: string;
  nativeMemories: MemoryListRow[];
  externalMemories: MemoryListRow[];
  nativeTotal: number;
  externalTotal: number;
  nativeQuery: TranslationMemoriesTableQuery;
  externalQuery: TranslationMemoriesTableQuery;
  allowCreateMemories: boolean;
  hasConnectedProvider: boolean;
  useLiveProviderMemories: boolean;
  connectedProviderKinds?: readonly string[];
  selectedExternalProjectId: string;
  onSelectedExternalProjectIdChange: (value: string) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  sourceFilter: string;
  onSourceFilterChange: (value: string) => void;
  projectFilter: string;
  onProjectFilterChange: (value: string) => void;
  projects: readonly { id: string; name: string }[];
  providerFilter: string;
  onProviderFilterChange: (value: string) => void;
  syncFilter: string;
  onSyncFilterChange: (value: string) => void;
  providerKinds: string[];
  hasExternalMemories: boolean;
  hasMemories: boolean;
  showNoFilterMatches: boolean;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  nativeHasMore: boolean;
  nativeIsLoadingMore: boolean;
  onNativeLoadMore: () => void;
  externalHasMore: boolean;
  externalIsLoadingMore: boolean;
  onExternalLoadMore: () => void;
  createDialogOpen: boolean;
  onCreateDialogOpenChange: (open: boolean) => void;
  createForm: MemoryCreateForm;
  onCreateFormChange: (form: MemoryCreateForm) => void;
  createErrors: { name?: string; importFile?: string };
  isCreating: boolean;
  onSubmitCreateMemory: () => void;
  onImportMemory: () => void;
}) {
  const intl = useIntl();
  const columns = useTranslationMemoriesTableColumns();
  const liveProjectSelectionRequired = useLiveProviderMemories && !selectedExternalProjectId;
  const showNativeSection = sourceFilter === "all" || sourceFilter === "native";
  const showExternalSection = sourceFilter === "all" || sourceFilter === "external_tms";
  const nativeSectionTitle = intl.formatMessage(
    translationMemoriesPageViewMessages.nativeSectionTitle,
  );
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
  const allProvidersLabel = intl.formatMessage(translationMemoriesPageViewMessages.providerAll);
  const allProjectsLabel = intl.formatMessage(translationMemoriesPageViewMessages.projectAll);
  const selectedProjectName =
    projectFilter === "all"
      ? allProjectsLabel
      : (projects.find((project) => project.id === projectFilter)?.name ?? allProjectsLabel);
  const filtersReady =
    (!showNativeSection || nativeQuery.isSuccess) &&
    (!showExternalSection || externalQuery.isSuccess);
  const providerGroups = groupByTmsProvider({
    items: liveProjectSelectionRequired ? [] : externalMemories,
    connectedKinds: connectedProviderKinds ?? [],
  });
  const liveProviderKind = useLiveProviderMemories ? (connectedProviderKinds?.[0] ?? null) : null;
  const nativeEmptyTitle = allowCreateMemories
    ? intl.formatMessage(translationMemoriesPageViewMessages.emptyTitle)
    : intl.formatMessage(translationMemoriesPageViewMessages.nativeEmptyTitle);
  const nativeEmptyDescription = allowCreateMemories
    ? intl.formatMessage(translationMemoriesPageViewMessages.emptyDescriptionCreate)
    : intl.formatMessage(translationMemoriesPageViewMessages.nativeEmptyDescription);
  const providerConnectAction = !hasConnectedProvider ? (
    <TranslationMemoriesEmptyAction organizationSlug={organizationSlug} />
  ) : undefined;
  return (
    <WorkspacePageShell className="gap-6">
      <PageHeader
        icon={DatabaseIcon}
        label={intl.formatMessage(translationMemoriesPageViewMessages.pageLabel)}
        title={intl.formatMessage(translationMemoriesPageViewMessages.pageTitle)}
        actions={
          allowCreateMemories ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onImportMemory}
                className="w-full sm:w-fit"
              >
                <UploadSimpleIcon />
                <FormattedMessage {...translationMemoriesPageViewMessages.importMemory} />
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => onCreateDialogOpenChange(true)}
                className="w-full sm:w-fit"
              >
                <PlusIcon />
                <FormattedMessage {...translationMemoriesPageViewMessages.createMemory} />
              </Button>
            </div>
          ) : null
        }
      />

      {hasActiveFilters || (filtersReady && (hasMemories || projects.length > 0)) ? (
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
              onChange={(event) => onSearchQueryChange(event.target.value)}
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
          {!useLiveProviderMemories && projects.length > 0 ? (
            <WorkspaceFilterField
              label={intl.formatMessage(translationMemoriesPageViewMessages.projectLabel)}
              className="w-full sm:w-52"
            >
              <Select
                value={projectFilter}
                onValueChange={(value) => onProjectFilterChange(value ?? "all")}
              >
                <SelectTrigger className={workspaceFilterTriggerClassName}>
                  <SelectValue>{selectedProjectName}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" label={allProjectsLabel}>
                    {allProjectsLabel}
                  </SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id} label={project.name}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </WorkspaceFilterField>
          ) : null}
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
          {hasActiveFilters ? (
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

      <WorkspaceGroupedTable
        ariaLabel={intl.formatMessage(translationMemoriesPageViewMessages.pageTitle)}
        columns={columns}
        getRowId={(memory) => memory.id}
        renderCells={(memory) => renderMemoryTableCells(memory, organizationSlug, intl)}
        groups={[
          ...(showNativeSection
            ? [
                {
                  id: "hyperlocalise",
                  title: nativeSectionTitle,
                  accent: "workspace" as const,
                  count: nativeTotal,
                  items: nativeMemories,
                  query: nativeQuery,
                  emptyTitle: nativeEmptyTitle,
                  emptyDescription: nativeEmptyDescription,
                  emptyAction: allowCreateMemories ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => onCreateDialogOpenChange(true)}
                      >
                        <FormattedMessage {...translationMemoriesPageViewMessages.createMemory} />
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={onImportMemory}>
                        <FormattedMessage {...translationMemoriesPageViewMessages.importMemory} />
                      </Button>
                    </div>
                  ) : !hasConnectedProvider ? (
                    <TranslationMemoriesEmptyAction organizationSlug={organizationSlug} />
                  ) : undefined,
                  hasMore: nativeHasMore,
                  isLoadingMore: nativeIsLoadingMore,
                  onLoadMore: onNativeLoadMore,
                },
              ]
            : []),
          ...(showExternalSection
            ? providerGroups.map((group, index) => ({
                id: group.id,
                title: group.title,
                accent: "provider" as const,
                count: liveProjectSelectionRequired ? 0 : group.items.length,
                items: group.items,
                query: liveProjectSelectionRequired
                  ? { isLoading: false, isError: false, isSuccess: true, error: null }
                  : externalQuery,
                emptyTitle: liveProjectSelectionRequired
                  ? intl.formatMessage(translationMemoriesPageViewMessages.chooseTmsProjectTitle)
                  : !hasConnectedProvider
                    ? intl.formatMessage(
                        translationMemoriesPageViewMessages.emptyTitleConnectProvider,
                      )
                    : intl.formatMessage(translationMemoriesPageViewMessages.externalEmptyTitle, {
                        provider: group.title,
                      }),
                emptyDescription: liveProjectSelectionRequired
                  ? intl.formatMessage(
                      translationMemoriesPageViewMessages.chooseTmsProjectDescription,
                    )
                  : !hasConnectedProvider
                    ? intl.formatMessage(
                        translationMemoriesPageViewMessages.emptyDescriptionWithoutProvider,
                      )
                    : intl.formatMessage(
                        translationMemoriesPageViewMessages.emptyDescriptionWithProvider,
                        {
                          provider: group.title,
                        },
                      ),
                emptyAction: liveProjectSelectionRequired ? undefined : providerConnectAction,
                headerActions:
                  liveProviderKind && group.id === liveProviderKind ? (
                    <TmsLiveProjectPicker
                      organizationSlug={organizationSlug}
                      value={selectedExternalProjectId}
                      onValueChange={onSelectedExternalProjectIdChange}
                    />
                  ) : undefined,
                hasMore:
                  !liveProjectSelectionRequired &&
                  externalHasMore &&
                  index === providerGroups.length - 1,
                isLoadingMore: externalIsLoadingMore,
                onLoadMore: onExternalLoadMore,
              }))
            : []),
        ]}
      />

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
            <Field className="gap-1.5">
              <FieldLabel>
                <FormattedMessage {...translationMemoriesPageViewMessages.importFileLabel} />
              </FieldLabel>
              <input
                id="create-translation-memory-file-import"
                type="file"
                accept=".csv,.tmx,text/csv,application/xml,text/xml"
                className="sr-only"
                disabled={isCreating}
                aria-label={intl.formatMessage(translationMemoriesPageViewMessages.importFileLabel)}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  const nextName =
                    createForm.name.trim() ||
                    (file ? suggestedMemoryNameFromFilename(file.name) : createForm.name);
                  onCreateFormChange({ ...createForm, name: nextName, importFile: file });
                  event.currentTarget.value = "";
                }}
              />
              {createForm.importFile ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <TypographyP size="small">
                    <FormattedMessage
                      {...translationMemoriesPageViewMessages.selectedImportFile}
                      values={{
                        filename: createForm.importFile.name,
                        format: (
                          memoryImportFormatFromFilename(createForm.importFile.name) ?? "file"
                        ).toUpperCase(),
                      }}
                    />
                  </TypographyP>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isCreating}
                    onClick={() => onCreateFormChange({ ...createForm, importFile: null })}
                  >
                    <FormattedMessage {...translationMemoriesPageViewMessages.clearImportFile} />
                  </Button>
                </div>
              ) : (
                <label
                  htmlFor="create-translation-memory-file-import"
                  className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-6 py-6 text-center transition-colors hover:bg-muted/40"
                >
                  <UploadSimpleIcon className="size-5" />
                  <span className="text-sm font-medium text-foreground">
                    <FormattedMessage {...translationMemoriesPageViewMessages.selectImportFile} />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <FormattedMessage {...translationMemoriesPageViewMessages.importFileHint} />
                  </span>
                </label>
              )}
              <FieldError
                errors={
                  createErrors.importFile ? [{ message: createErrors.importFile }] : undefined
                }
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
    </WorkspacePageShell>
  );
}
