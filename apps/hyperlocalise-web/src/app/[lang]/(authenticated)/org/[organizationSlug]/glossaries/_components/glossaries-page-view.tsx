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
import { BookOpenTextIcon, Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

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
import { TypographyP } from "@/components/ui/typography";

import { TmsLiveProjectPicker } from "../../_components/tms-live-project-picker";
import {
  PageHeader,
  WorkspaceFilterField,
  workspaceFilterTriggerClassName,
} from "../../_components/workspace-resource-shared";
import type { GlossaryListRow } from "./glossary-list";
import { providerLabel } from "./glossary-list";
import { GlossariesEmptyAction, GlossariesTable } from "./glossaries-table";
import { glossariesPageViewMessages } from "./glossaries-page-view.messages";
import {
  ProjectSourceLocalePicker,
  ProjectTargetLocalesPicker,
} from "../../projects/_components/project-locale-picker";

export const GLOSSARIES_PAGE_SIZE = 100;

export type GlossaryCreateForm = {
  name: string;
  description: string;
  sourceLocale: string;
  targetLocales: string[];
};

export function GlossariesPageView({
  organizationSlug,
  glossaries,
  glossaryTotal,
  isLoading,
  isError,
  isSuccess,
  error,
  allowCreateGlossaries,
  hasConnectedProvider,
  useLiveProviderGlossaries,
  selectedExternalProjectId,
  onSelectedExternalProjectIdChange,
  searchQuery,
  onSearchQueryChange,
  sourceFilter,
  onSourceFilterChange,
  providerFilter,
  onProviderFilterChange,
  resourceTypeFilter,
  onResourceTypeFilterChange,
  syncFilter,
  onSyncFilterChange,
  providerKinds,
  hasExternalGlossaries,
  hasResourceTypes,
  hasActiveFilters,
  activeFilterCount,
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
  onSubmitCreateGlossary,
}: {
  organizationSlug: string;
  glossaries: GlossaryListRow[];
  glossaryTotal: number;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: Error | null;
  allowCreateGlossaries: boolean;
  hasConnectedProvider: boolean;
  useLiveProviderGlossaries: boolean;
  selectedExternalProjectId: string;
  onSelectedExternalProjectIdChange: (value: string) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  sourceFilter: string;
  onSourceFilterChange: (value: string) => void;
  providerFilter: string;
  onProviderFilterChange: (value: string) => void;
  resourceTypeFilter: string;
  onResourceTypeFilterChange: (value: string) => void;
  syncFilter: string;
  onSyncFilterChange: (value: string) => void;
  providerKinds: string[];
  hasExternalGlossaries: boolean;
  hasResourceTypes: boolean;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  onClearFilters: () => void;
  page: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  onPageChange: (page: number) => void;
  createDialogOpen: boolean;
  onCreateDialogOpenChange: (open: boolean) => void;
  createForm: GlossaryCreateForm;
  onCreateFormChange: (form: GlossaryCreateForm) => void;
  createErrors: { name?: string; targetLocales?: string };
  isCreating: boolean;
  onSubmitCreateGlossary: () => void;
}) {
  const intl = useIntl();
  const liveProjectSelectionRequired = useLiveProviderGlossaries && !selectedExternalProjectId;

  const sourceFilterLabels = {
    all: intl.formatMessage(glossariesPageViewMessages.sourceAll),
    native: intl.formatMessage(glossariesPageViewMessages.sourceNative),
    external_tms: intl.formatMessage(glossariesPageViewMessages.sourceExternalTms),
  } as const;

  const resourceTypeFilterLabels = {
    all: intl.formatMessage(glossariesPageViewMessages.resourceAll),
    glossary: intl.formatMessage(glossariesPageViewMessages.resourceGlossary),
    term_base: intl.formatMessage(glossariesPageViewMessages.resourceTermBase),
  } as const;

  const syncFilterLabels = {
    all: intl.formatMessage(glossariesPageViewMessages.syncAll),
    synced: intl.formatMessage(glossariesPageViewMessages.syncSynced),
    stale: intl.formatMessage(glossariesPageViewMessages.syncStale),
    syncing: intl.formatMessage(glossariesPageViewMessages.syncSyncing),
    error: intl.formatMessage(glossariesPageViewMessages.syncError),
  } as const;

  const emptyTitle = hasConnectedProvider
    ? intl.formatMessage(glossariesPageViewMessages.emptyTitle)
    : intl.formatMessage(glossariesPageViewMessages.emptyTitleConnectProvider);
  const emptyDescription = hasConnectedProvider
    ? intl.formatMessage(glossariesPageViewMessages.emptyDescriptionWithProvider)
    : intl.formatMessage(glossariesPageViewMessages.emptyDescriptionWithoutProvider);

  const glossaryCountLabel =
    isSuccess && glossaryTotal > 0
      ? intl.formatMessage(glossariesPageViewMessages.glossaryCount, {
          count: glossaryTotal,
        })
      : undefined;

  const glossariesQuery = { isLoading, isError, isSuccess, error };
  const allProvidersLabel = intl.formatMessage(glossariesPageViewMessages.providerAll);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        icon={BookOpenTextIcon}
        label={intl.formatMessage(glossariesPageViewMessages.pageLabel)}
        title={intl.formatMessage(glossariesPageViewMessages.pageTitle)}
        description={intl.formatMessage(glossariesPageViewMessages.pageDescription)}
        statusLabel={glossaryCountLabel}
        actions={
          allowCreateGlossaries ? (
            <Button
              type="button"
              onClick={() => onCreateDialogOpenChange(true)}
              className="w-full sm:w-fit"
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
              <FormattedMessage {...glossariesPageViewMessages.createGlossary} />
            </Button>
          ) : null
        }
      />

      {useLiveProviderGlossaries ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-2">
          <TmsLiveProjectPicker
            organizationSlug={organizationSlug}
            value={selectedExternalProjectId}
            onValueChange={onSelectedExternalProjectIdChange}
          />
        </div>
      ) : null}

      {isSuccess && (glossaryTotal > 0 || hasActiveFilters) ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-2">
          <WorkspaceFilterField
            label={intl.formatMessage(glossariesPageViewMessages.searchLabel)}
            className="w-full sm:max-w-xs"
          >
            <Input
              placeholder={intl.formatMessage(glossariesPageViewMessages.searchPlaceholder)}
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="w-full"
            />
          </WorkspaceFilterField>
          <WorkspaceFilterField
            label={intl.formatMessage(glossariesPageViewMessages.sourceLabel)}
            className="w-full sm:w-40"
          >
            <Select
              value={sourceFilter}
              onValueChange={(value) => {
                onSourceFilterChange(value ?? "all");
                if (value === "native") {
                  onProviderFilterChange("all");
                  onResourceTypeFilterChange("all");
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

          {hasExternalGlossaries && sourceFilter !== "native" ? (
            <WorkspaceFilterField
              label={intl.formatMessage(glossariesPageViewMessages.providerLabel)}
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

          {hasResourceTypes && sourceFilter !== "native" ? (
            <WorkspaceFilterField
              label={intl.formatMessage(glossariesPageViewMessages.resourceLabel)}
              className="w-full sm:w-44"
            >
              <Select
                value={resourceTypeFilter}
                onValueChange={(value) => onResourceTypeFilterChange(value ?? "all")}
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

          {hasExternalGlossaries && sourceFilter !== "native" && !useLiveProviderGlossaries ? (
            <WorkspaceFilterField
              label={intl.formatMessage(glossariesPageViewMessages.syncLabel)}
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
              <FormattedMessage {...glossariesPageViewMessages.clearFilters} />
            </Button>
          ) : null}
        </div>
      ) : null}

      {isSuccess && hasActiveFilters && glossaryTotal === 0 ? (
        <div className="text-sm text-muted-foreground">
          <FormattedMessage
            {...glossariesPageViewMessages.noFilterMatches}
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
            <FormattedMessage {...glossariesPageViewMessages.chooseTmsProjectTitle} />
          </TypographyP>
          <TypographyP className="max-w-xl text-sm leading-6 text-muted-foreground">
            <FormattedMessage {...glossariesPageViewMessages.chooseTmsProjectDescription} />
          </TypographyP>
        </div>
      ) : (
        <GlossariesTable
          glossaries={glossaries}
          glossariesQuery={glossariesQuery}
          organizationSlug={organizationSlug}
          emptyTitle={
            allowCreateGlossaries
              ? intl.formatMessage(glossariesPageViewMessages.emptyTitle)
              : emptyTitle
          }
          emptyDescription={
            allowCreateGlossaries
              ? intl.formatMessage(glossariesPageViewMessages.emptyDescriptionCreate)
              : emptyDescription
          }
          emptyAction={
            allowCreateGlossaries ? (
              <Button type="button" size="sm" onClick={() => onCreateDialogOpenChange(true)}>
                <FormattedMessage {...glossariesPageViewMessages.createGlossary} />
              </Button>
            ) : (
              <GlossariesEmptyAction organizationSlug={organizationSlug} />
            )
          }
        />
      )}

      {!liveProjectSelectionRequired && isSuccess && glossaryTotal > GLOSSARIES_PAGE_SIZE ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            <FormattedMessage
              {...glossariesPageViewMessages.paginationSummary}
              values={{ pageStart, pageEnd, glossaryTotal }}
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
              <FormattedMessage {...glossariesPageViewMessages.previousPage} />
            </Button>
            <p className="text-sm text-muted-foreground">
              <FormattedMessage
                {...glossariesPageViewMessages.paginationPage}
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
              <FormattedMessage {...glossariesPageViewMessages.nextPage} />
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={createDialogOpen} onOpenChange={onCreateDialogOpenChange}>
        <DialogContent className="max-h-[min(85dvh,42rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...glossariesPageViewMessages.createDialogTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...glossariesPageViewMessages.createDialogDescription} />
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field className="gap-1.5">
              <FieldLabel>
                <FormattedMessage {...glossariesPageViewMessages.nameLabel} />
              </FieldLabel>
              <Input
                value={createForm.name}
                onChange={(event) =>
                  onCreateFormChange({ ...createForm, name: event.target.value })
                }
                disabled={isCreating}
                placeholder={intl.formatMessage(glossariesPageViewMessages.namePlaceholder)}
              />
              <FieldError
                errors={createErrors.name ? [{ message: createErrors.name }] : undefined}
              />
            </Field>
            <ProjectSourceLocalePicker
              value={createForm.sourceLocale}
              onChange={(sourceLocale) => onCreateFormChange({ ...createForm, sourceLocale })}
              disabled={isCreating}
            />
            <ProjectTargetLocalesPicker
              value={createForm.targetLocales}
              sourceLocale={createForm.sourceLocale}
              onChange={(targetLocales) =>
                onCreateFormChange({
                  ...createForm,
                  targetLocales: targetLocales.slice(0, 1),
                })
              }
              disabled={isCreating}
              error={createErrors.targetLocales}
            />
            <Field className="gap-1.5">
              <FieldLabel>
                <FormattedMessage {...glossariesPageViewMessages.descriptionLabel} />
              </FieldLabel>
              <Textarea
                value={createForm.description}
                onChange={(event) =>
                  onCreateFormChange({ ...createForm, description: event.target.value })
                }
                disabled={isCreating}
                placeholder={intl.formatMessage(glossariesPageViewMessages.descriptionPlaceholder)}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onCreateDialogOpenChange(false)}
              disabled={isCreating}
            >
              <FormattedMessage {...glossariesPageViewMessages.cancel} />
            </Button>
            <Button onClick={onSubmitCreateGlossary} disabled={isCreating}>
              {isCreating ? <Spinner /> : null}
              <FormattedMessage {...glossariesPageViewMessages.createGlossary} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
