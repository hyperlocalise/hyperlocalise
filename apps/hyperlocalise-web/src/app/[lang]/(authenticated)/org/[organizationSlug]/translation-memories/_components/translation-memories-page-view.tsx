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
import { Add01Icon, Database01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
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
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { TypographyP } from "@/components/ui/typography";

import {
  memoryImportFormatFromFilename,
  suggestedMemoryNameFromFilename,
} from "@/lib/memory/decode-import-file";

import { TmsLiveProjectPicker } from "../../_components/tms-live-project-picker";
import { WorkspaceGroupedTable } from "../../_components/workspace-grouped-table";
import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import type { MemoryListRow } from "./memory-list";
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
  externalTotal,
  nativeQuery,
  externalQuery,
  allowCreateMemories,
  hasConnectedProvider,
  useLiveProviderMemories,
  selectedExternalProjectId,
  onSelectedExternalProjectIdChange,
  searchQuery,
  onSearchQueryChange,
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
  selectedExternalProjectId: string;
  onSelectedExternalProjectIdChange: (value: string) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
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
  const nativeSectionTitle = intl.formatMessage(
    translationMemoriesPageViewMessages.nativeSectionTitle,
  );
  const externalSectionTitle = intl.formatMessage(
    translationMemoriesPageViewMessages.externalSectionTitle,
  );
  const nativeEmptyTitle = allowCreateMemories
    ? intl.formatMessage(translationMemoriesPageViewMessages.emptyTitle)
    : intl.formatMessage(translationMemoriesPageViewMessages.nativeEmptyTitle);
  const nativeEmptyDescription = allowCreateMemories
    ? intl.formatMessage(translationMemoriesPageViewMessages.emptyDescriptionCreate)
    : intl.formatMessage(translationMemoriesPageViewMessages.nativeEmptyDescription);
  const externalEmptyTitle = hasConnectedProvider
    ? intl.formatMessage(translationMemoriesPageViewMessages.externalEmptyTitle)
    : intl.formatMessage(translationMemoriesPageViewMessages.emptyTitleConnectProvider);
  const externalEmptyDescription = hasConnectedProvider
    ? intl.formatMessage(translationMemoriesPageViewMessages.emptyDescriptionWithProvider)
    : intl.formatMessage(translationMemoriesPageViewMessages.emptyDescriptionWithoutProvider);
  const queriesHaveNoResults =
    nativeQuery.isSuccess &&
    externalQuery.isSuccess &&
    nativeTotal === 0 &&
    externalTotal === 0 &&
    !liveProjectSelectionRequired;

  return (
    <WorkspacePageShell className="gap-6">
      <PageHeader
        icon={Database01Icon}
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
                <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} />
                <FormattedMessage {...translationMemoriesPageViewMessages.importMemory} />
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => onCreateDialogOpenChange(true)}
                className="w-full sm:w-fit"
              >
                <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
                <FormattedMessage {...translationMemoriesPageViewMessages.createMemory} />
              </Button>
            </div>
          ) : null
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
          <Input
            aria-label={intl.formatMessage(translationMemoriesPageViewMessages.searchLabel)}
            placeholder={intl.formatMessage(translationMemoriesPageViewMessages.searchPlaceholder)}
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            className="w-full sm:max-w-xs"
          />
          {hasActiveFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClearFilters}>
              <FormattedMessage {...translationMemoriesPageViewMessages.clearFilters} />
            </Button>
          ) : null}
        </div>
      </PageHeader>

      {queriesHaveNoResults && hasActiveFilters ? (
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
          {
            id: "workspace",
            title: nativeSectionTitle,
            count: nativeTotal,
            items: nativeMemories,
            query: nativeQuery,
            emptyTitle: nativeEmptyTitle,
            emptyDescription: nativeEmptyDescription,
            emptyAction: allowCreateMemories ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={() => onCreateDialogOpenChange(true)}>
                  <FormattedMessage {...translationMemoriesPageViewMessages.createMemory} />
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={onImportMemory}>
                  <FormattedMessage {...translationMemoriesPageViewMessages.importMemory} />
                </Button>
              </div>
            ) : undefined,
            hasMore: nativeHasMore,
            isLoadingMore: nativeIsLoadingMore,
            onLoadMore: onNativeLoadMore,
          },
          {
            id: "provider",
            title: externalSectionTitle,
            count: liveProjectSelectionRequired ? 0 : externalTotal,
            items: liveProjectSelectionRequired ? [] : externalMemories,
            query: liveProjectSelectionRequired
              ? { isLoading: false, isError: false, isSuccess: true, error: null }
              : externalQuery,
            emptyTitle: liveProjectSelectionRequired
              ? intl.formatMessage(translationMemoriesPageViewMessages.chooseTmsProjectTitle)
              : externalEmptyTitle,
            emptyDescription: liveProjectSelectionRequired
              ? intl.formatMessage(translationMemoriesPageViewMessages.chooseTmsProjectDescription)
              : externalEmptyDescription,
            emptyAction:
              !liveProjectSelectionRequired && !hasConnectedProvider ? (
                <TranslationMemoriesEmptyAction organizationSlug={organizationSlug} />
              ) : undefined,
            headerActions: useLiveProviderMemories ? (
              <TmsLiveProjectPicker
                organizationSlug={organizationSlug}
                value={selectedExternalProjectId}
                onValueChange={onSelectedExternalProjectIdChange}
              />
            ) : undefined,
            hasMore: liveProjectSelectionRequired ? false : externalHasMore,
            isLoadingMore: externalIsLoadingMore,
            onLoadMore: onExternalLoadMore,
          },
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
                  <HugeiconsIcon icon={Upload01Icon} className="size-5" strokeWidth={1.8} />
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
