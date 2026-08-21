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
import Link from "next/link";
import { useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import {
  GlossariesEmptyAction,
  GlossariesTable,
  type GlossariesTableQuery,
} from "./glossaries-table";
import { glossariesPageViewMessages } from "./glossaries-page-view.messages";
import { ProjectSourceLocalePicker } from "../../projects/_components/project-locale-picker";

export const GLOSSARIES_PAGE_SIZE = 100;

export type GlossaryCreateForm = {
  name: string;
  description: string;
  sourceLocale: string;
  projectIds: string[];
};

function GlossariesWorkspaceEmptyState({
  organizationSlug,
  allowCreateGlossaries,
  hasConnectedProvider,
  onCreateGlossary,
}: {
  organizationSlug: string;
  allowCreateGlossaries: boolean;
  hasConnectedProvider: boolean;
  onCreateGlossary: () => void;
}) {
  return (
    <Empty className="items-start gap-6 border border-border bg-muted/40 px-6 py-10 text-left sm:px-10">
      <EmptyHeader className="items-start gap-3 text-left">
        <EmptyMedia
          variant="icon"
          className="size-11 rounded-xl border border-border bg-background text-subtle-foreground [&_svg:not([class*='size-'])]:size-5"
        >
          <HugeiconsIcon icon={BookOpenTextIcon} strokeWidth={1.7} aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-xl font-medium text-foreground text-balance">
          <FormattedMessage {...glossariesPageViewMessages.workspaceEmptyTitle} />
        </EmptyTitle>
        <EmptyDescription className="max-w-2xl text-sm leading-6 text-muted-foreground text-pretty">
          <FormattedMessage {...glossariesPageViewMessages.workspaceEmptyDescription} />
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="items-start gap-3 text-left sm:flex-row sm:items-center">
        {allowCreateGlossaries ? (
          <Button type="button" onClick={onCreateGlossary}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
            <FormattedMessage {...glossariesPageViewMessages.createGlossary} />
          </Button>
        ) : null}
        <Button
          nativeButton={false}
          render={<Link href={`/org/${organizationSlug}/integrations`} />}
          variant={allowCreateGlossaries ? "outline" : "default"}
        >
          <FormattedMessage
            {...(hasConnectedProvider
              ? glossariesPageViewMessages.openIntegrations
              : glossariesPageViewMessages.connectProvider)}
          />
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export function GlossariesPageView({
  organizationSlug,
  nativeGlossaries,
  externalGlossaries,
  glossaryTotal,
  nativeTotal,
  externalTotal,
  nativeQuery,
  externalQuery,
  allowCreateGlossaries,
  hasConnectedProvider,
  useLiveProviderGlossaries,
  useLiveCrowdinGlossaries,
  selectedExternalProjectId,
  onSelectedExternalProjectIdChange,
  searchQuery,
  onSearchQueryChange,
  hasActiveFilters,
  activeFilterCount,
  onClearFilters,
  page,
  totalPages,
  pageStart,
  pageEnd,
  onPageChange,
  crowdinPage,
  crowdinHasMore,
  onCrowdinPageChange,
  crowdinOrderBy,
  onCrowdinOrderByChange,
  createDialogOpen,
  onCreateDialogOpenChange,
  createForm,
  onCreateFormChange,
  projects,
  createErrors,
  isCreating,
  onSubmitCreateGlossary,
}: {
  organizationSlug: string;
  nativeGlossaries: GlossaryListRow[];
  externalGlossaries: GlossaryListRow[];
  glossaryTotal: number;
  nativeTotal: number;
  externalTotal: number;
  nativeQuery: GlossariesTableQuery;
  externalQuery: GlossariesTableQuery;
  allowCreateGlossaries: boolean;
  hasConnectedProvider: boolean;
  useLiveProviderGlossaries: boolean;
  useLiveCrowdinGlossaries: boolean;
  selectedExternalProjectId: string;
  onSelectedExternalProjectIdChange: (value: string) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  onClearFilters: () => void;
  page: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  onPageChange: (page: number) => void;
  crowdinPage: number;
  crowdinHasMore: boolean;
  onCrowdinPageChange: (page: number) => void;
  crowdinOrderBy: string;
  onCrowdinOrderByChange: (orderBy: string) => void;
  createDialogOpen: boolean;
  onCreateDialogOpenChange: (open: boolean) => void;
  createForm: GlossaryCreateForm;
  onCreateFormChange: (form: GlossaryCreateForm) => void;
  projects: Array<{ id: string; name: string; sourceLocale: string }>;
  createErrors: { name?: string };
  isCreating: boolean;
  onSubmitCreateGlossary: () => void;
}) {
  const intl = useIntl();
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const liveProjectSelectionRequired =
    useLiveProviderGlossaries && !useLiveCrowdinGlossaries && !selectedExternalProjectId;
  const selectableProjects = useMemo(
    () => projects.filter((project) => project.sourceLocale === createForm.sourceLocale),
    [createForm.sourceLocale, projects],
  );
  const selectedProjectNames = useMemo(
    () =>
      selectableProjects
        .filter((project) => createForm.projectIds.includes(project.id))
        .map((project) => project.name),
    [createForm.projectIds, selectableProjects],
  );

  const nativeEmptyTitle = allowCreateGlossaries
    ? intl.formatMessage(glossariesPageViewMessages.emptyTitle)
    : intl.formatMessage(glossariesPageViewMessages.nativeEmptyTitle);
  const nativeEmptyDescription = allowCreateGlossaries
    ? intl.formatMessage(glossariesPageViewMessages.emptyDescriptionCreate)
    : intl.formatMessage(glossariesPageViewMessages.nativeEmptyDescription);
  const externalEmptyTitle = hasConnectedProvider
    ? intl.formatMessage(
        useLiveCrowdinGlossaries
          ? glossariesPageViewMessages.crowdinEmptyTitle
          : glossariesPageViewMessages.externalEmptyTitle,
      )
    : intl.formatMessage(glossariesPageViewMessages.emptyTitleConnectProvider);
  const externalEmptyDescription = hasConnectedProvider
    ? intl.formatMessage(
        useLiveCrowdinGlossaries
          ? glossariesPageViewMessages.crowdinEmptyDescription
          : glossariesPageViewMessages.emptyDescriptionWithProvider,
      )
    : intl.formatMessage(glossariesPageViewMessages.emptyDescriptionWithoutProvider);
  const nativeSectionTitle = intl.formatMessage(glossariesPageViewMessages.nativeSectionTitle);
  const externalSectionTitle = useLiveCrowdinGlossaries
    ? intl.formatMessage(glossariesPageViewMessages.crowdinSectionTitle)
    : intl.formatMessage(glossariesPageViewMessages.externalSectionTitle);
  const glossaryCountLabel =
    glossaryTotal > 0
      ? intl.formatMessage(glossariesPageViewMessages.glossaryCount, {
          count: glossaryTotal,
        })
      : undefined;
  const hasAnyResults = nativeTotal > 0 || externalTotal > 0;
  const queriesHaveNoResults = nativeQuery.isSuccess && externalQuery.isSuccess && !hasAnyResults;
  const showWorkspaceEmptyState =
    queriesHaveNoResults && !hasActiveFilters && !useLiveProviderGlossaries;
  const liveProviderControls = useLiveProviderGlossaries ? (
    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
      <TmsLiveProjectPicker
        organizationSlug={organizationSlug}
        value={selectedExternalProjectId}
        onValueChange={onSelectedExternalProjectIdChange}
        allowAll={useLiveCrowdinGlossaries}
      />
      {useLiveCrowdinGlossaries ? (
        <WorkspaceFilterField
          label={intl.formatMessage(glossariesPageViewMessages.sortLabel)}
          className="w-full sm:w-44"
        >
          <Select
            value={crowdinOrderBy}
            onValueChange={(value) => {
              if (value) onCrowdinOrderByChange(value);
            }}
          >
            <SelectTrigger className={workspaceFilterTriggerClassName}>
              <SelectValue>
                {crowdinOrderBy === "name asc"
                  ? intl.formatMessage(glossariesPageViewMessages.sortNameAsc)
                  : crowdinOrderBy === "name desc"
                    ? intl.formatMessage(glossariesPageViewMessages.sortNameDesc)
                    : intl.formatMessage(glossariesPageViewMessages.sortNewest)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                value="createdAt desc,name"
                label={intl.formatMessage(glossariesPageViewMessages.sortNewest)}
              >
                <FormattedMessage {...glossariesPageViewMessages.sortNewest} />
              </SelectItem>
              <SelectItem
                value="name asc"
                label={intl.formatMessage(glossariesPageViewMessages.sortNameAsc)}
              >
                <FormattedMessage {...glossariesPageViewMessages.sortNameAsc} />
              </SelectItem>
              <SelectItem
                value="name desc"
                label={intl.formatMessage(glossariesPageViewMessages.sortNameDesc)}
              >
                <FormattedMessage {...glossariesPageViewMessages.sortNameDesc} />
              </SelectItem>
            </SelectContent>
          </Select>
        </WorkspaceFilterField>
      ) : null}
    </div>
  ) : null;
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        icon={BookOpenTextIcon}
        label={intl.formatMessage(glossariesPageViewMessages.pageLabel)}
        title={intl.formatMessage(glossariesPageViewMessages.pageTitle)}
        description={intl.formatMessage(glossariesPageViewMessages.pageDescription)}
        statusLabel={glossaryCountLabel}
        actions={
          allowCreateGlossaries && !showWorkspaceEmptyState ? (
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

      {hasAnyResults || hasActiveFilters || nativeQuery.isLoading || externalQuery.isLoading ? (
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
          {activeFilterCount > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClearFilters}>
              <FormattedMessage {...glossariesPageViewMessages.clearFilters} />
            </Button>
          ) : null}
        </div>
      ) : null}

      {queriesHaveNoResults && hasActiveFilters ? (
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

      {showWorkspaceEmptyState ? (
        <GlossariesWorkspaceEmptyState
          organizationSlug={organizationSlug}
          allowCreateGlossaries={allowCreateGlossaries}
          hasConnectedProvider={hasConnectedProvider}
          onCreateGlossary={() => onCreateDialogOpenChange(true)}
        />
      ) : null}

      {!showWorkspaceEmptyState ? (
        <div className="grid gap-8">
          <GlossariesTable
            glossaries={nativeGlossaries}
            glossariesQuery={nativeQuery}
            organizationSlug={organizationSlug}
            title={nativeSectionTitle}
            count={nativeTotal}
            emptyTitle={nativeEmptyTitle}
            emptyDescription={nativeEmptyDescription}
            emptyAction={
              allowCreateGlossaries ? (
                <Button type="button" size="sm" onClick={() => onCreateDialogOpenChange(true)}>
                  <FormattedMessage {...glossariesPageViewMessages.createGlossary} />
                </Button>
              ) : undefined
            }
          />
          {liveProjectSelectionRequired ? (
            <section aria-label={externalSectionTitle} className="min-w-0">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
                  {externalSectionTitle}
                </h2>
                {liveProviderControls}
              </div>
              <div className="space-y-3 rounded-lg border border-border px-5 py-8">
                <TypographyP className="text-sm font-medium text-foreground">
                  <FormattedMessage {...glossariesPageViewMessages.chooseTmsProjectTitle} />
                </TypographyP>
                <TypographyP className="max-w-xl text-sm leading-6 text-muted-foreground">
                  <FormattedMessage {...glossariesPageViewMessages.chooseTmsProjectDescription} />
                </TypographyP>
              </div>
            </section>
          ) : (
            <GlossariesTable
              glossaries={externalGlossaries}
              glossariesQuery={externalQuery}
              organizationSlug={organizationSlug}
              title={externalSectionTitle}
              headerActions={liveProviderControls}
              count={externalTotal}
              emptyTitle={externalEmptyTitle}
              emptyDescription={externalEmptyDescription}
              emptyAction={
                !hasConnectedProvider ? (
                  <GlossariesEmptyAction organizationSlug={organizationSlug} />
                ) : undefined
              }
            />
          )}
        </div>
      ) : null}

      {useLiveCrowdinGlossaries && nativeQuery.isSuccess && nativeTotal > GLOSSARIES_PAGE_SIZE ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            <FormattedMessage
              {...glossariesPageViewMessages.paginationSummary}
              values={{ pageStart, pageEnd, glossaryTotal: nativeTotal }}
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

      {useLiveCrowdinGlossaries &&
      externalQuery.isSuccess &&
      (crowdinPage > 1 || crowdinHasMore) ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            <FormattedMessage
              {...glossariesPageViewMessages.crowdinPaginationSummary}
              values={{ page: crowdinPage }}
            />
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={crowdinPage <= 1}
              onClick={() => onCrowdinPageChange(Math.max(1, crowdinPage - 1))}
            >
              <FormattedMessage {...glossariesPageViewMessages.previousPage} />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!crowdinHasMore}
              onClick={() => onCrowdinPageChange(crowdinPage + 1)}
            >
              <FormattedMessage {...glossariesPageViewMessages.nextPage} />
            </Button>
          </div>
        </div>
      ) : null}

      {!useLiveCrowdinGlossaries &&
      !useLiveProviderGlossaries &&
      glossaryTotal > GLOSSARIES_PAGE_SIZE ? (
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
              onChange={(sourceLocale) =>
                onCreateFormChange({
                  ...createForm,
                  sourceLocale,
                  projectIds: createForm.projectIds.filter((projectId) =>
                    projects.some(
                      (project) =>
                        project.id === projectId && project.sourceLocale === sourceLocale,
                    ),
                  ),
                })
              }
              disabled={isCreating}
            />
            <Field className="gap-1.5">
              <FieldLabel>
                <FormattedMessage {...glossariesPageViewMessages.projectLabel} />
              </FieldLabel>
              <Popover open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isCreating}
                      className="justify-between font-normal"
                      aria-label={intl.formatMessage(glossariesPageViewMessages.projectLabel)}
                    />
                  }
                >
                  <span className="truncate text-left">
                    {selectedProjectNames.length > 0
                      ? selectedProjectNames.join(", ")
                      : intl.formatMessage(glossariesPageViewMessages.projectPlaceholder)}
                  </span>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(24rem,calc(100vw-3rem))] p-0">
                  <Command>
                    <CommandInput
                      placeholder={intl.formatMessage(
                        glossariesPageViewMessages.projectSearchPlaceholder,
                      )}
                    />
                    <CommandList
                      label={intl.formatMessage(glossariesPageViewMessages.projectLabel)}
                      aria-multiselectable={true}
                    >
                      <CommandEmpty>
                        {intl.formatMessage(glossariesPageViewMessages.projectSelectionEmpty)}
                      </CommandEmpty>
                      <CommandGroup>
                        {selectableProjects.map((project) => {
                          const checked = createForm.projectIds.includes(project.id);
                          return (
                            <CommandItem
                              key={project.id}
                              value={`${project.id} ${project.name}`}
                              data-checked={checked || undefined}
                              aria-checked={checked}
                              onSelect={() =>
                                onCreateFormChange({
                                  ...createForm,
                                  projectIds: checked
                                    ? createForm.projectIds.filter((id) => id !== project.id)
                                    : [...createForm.projectIds, project.id],
                                })
                              }
                            >
                              <span className="truncate">{project.name}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <TypographyP className="text-xs text-muted-foreground">
                <FormattedMessage {...glossariesPageViewMessages.projectOptional} />
              </TypographyP>
            </Field>
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
