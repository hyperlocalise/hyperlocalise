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
import { BookOpenTextIcon, PlusIcon } from "@phosphor-icons/react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { TypographyP } from "@/components/ui/typography";

import { TmsLiveProjectPicker } from "../../_components/tms-live-project-picker";
import { groupByTmsProvider } from "../../_components/tms-resource-groups";
import { WorkspaceGroupedTable } from "../../_components/workspace-grouped-table";
import {
  PageHeader,
  WorkspaceFilterField,
  WorkspacePageShell,
  workspaceFilterTriggerClassName,
} from "../../_components/workspace-resource-shared";
import type { GlossaryListRow } from "./glossary-list";
import {
  GlossariesEmptyAction,
  renderGlossaryTableCells,
  useGlossariesTableColumns,
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

export function GlossariesPageView({
  organizationSlug,
  nativeGlossaries,
  externalGlossaries,
  nativeTotal,
  externalTotal,
  nativeQuery,
  externalQuery,
  allowCreateGlossaries,
  hasConnectedProvider,
  useLiveProviderGlossaries,
  useLiveCrowdinGlossaries,
  connectedProviderKinds,
  selectedExternalProjectId,
  onSelectedExternalProjectIdChange,
  searchQuery,
  onSearchQueryChange,
  hasActiveFilters,
  activeFilterCount,
  onClearFilters,
  nativeHasMore,
  nativeIsLoadingMore,
  onNativeLoadMore,
  externalHasMore,
  externalIsLoadingMore,
  onExternalLoadMore,
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
  nativeTotal: number;
  externalTotal: number;
  nativeQuery: GlossariesTableQuery;
  externalQuery: GlossariesTableQuery;
  allowCreateGlossaries: boolean;
  hasConnectedProvider: boolean;
  useLiveProviderGlossaries: boolean;
  useLiveCrowdinGlossaries: boolean;
  connectedProviderKinds?: readonly string[];
  selectedExternalProjectId: string;
  onSelectedExternalProjectIdChange: (value: string) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  onClearFilters: () => void;
  nativeHasMore: boolean;
  nativeIsLoadingMore: boolean;
  onNativeLoadMore: () => void;
  externalHasMore: boolean;
  externalIsLoadingMore: boolean;
  onExternalLoadMore: () => void;
  crowdinOrderBy: string;
  onCrowdinOrderByChange: (orderBy: string) => void;
  createDialogOpen: boolean;
  onCreateDialogOpenChange: (open: boolean) => void;
  createForm: GlossaryCreateForm;
  onCreateFormChange: (form: GlossaryCreateForm) => void;
  projects: Array<{ id: string; name: string; sourceLocale: string }>;
  createErrors: { name?: string; projectIds?: string };
  isCreating: boolean;
  onSubmitCreateGlossary: () => void;
}) {
  const intl = useIntl();
  const columns = useGlossariesTableColumns();
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
  const nativeSectionTitle = intl.formatMessage(glossariesPageViewMessages.nativeSectionTitle);
  const providerGroups = groupByTmsProvider({
    items: liveProjectSelectionRequired ? [] : externalGlossaries,
    connectedKinds: connectedProviderKinds ?? [],
  });
  const liveProviderKind = useLiveProviderGlossaries ? (connectedProviderKinds?.[0] ?? null) : null;
  const providerConnectAction = !hasConnectedProvider ? (
    <GlossariesEmptyAction organizationSlug={organizationSlug} />
  ) : undefined;
  const hasAnyResults = nativeTotal > 0 || externalTotal > 0;
  const queriesHaveNoResults = nativeQuery.isSuccess && externalQuery.isSuccess && !hasAnyResults;
  const liveProviderControls = useLiveProviderGlossaries ? (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
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
    <WorkspacePageShell className="gap-6">
      <PageHeader
        icon={BookOpenTextIcon}
        label={intl.formatMessage(glossariesPageViewMessages.pageLabel)}
        title={intl.formatMessage(glossariesPageViewMessages.pageTitle)}
        actions={
          allowCreateGlossaries ? (
            <Button
              type="button"
              size="sm"
              onClick={() => onCreateDialogOpenChange(true)}
              className="w-full sm:w-fit"
            >
              <PlusIcon />
              <FormattedMessage {...glossariesPageViewMessages.createGlossary} />
            </Button>
          ) : null
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
          <Input
            aria-label={intl.formatMessage(glossariesPageViewMessages.searchLabel)}
            placeholder={intl.formatMessage(glossariesPageViewMessages.searchPlaceholder)}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="w-full sm:max-w-xs"
          />
          {activeFilterCount > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClearFilters}>
              <FormattedMessage {...glossariesPageViewMessages.clearFilters} />
            </Button>
          ) : null}
        </div>
      </PageHeader>

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

      <WorkspaceGroupedTable
        ariaLabel={intl.formatMessage(glossariesPageViewMessages.pageTitle)}
        columns={columns}
        getRowId={(glossary) => glossary.id}
        renderCells={(glossary) => renderGlossaryTableCells(glossary, organizationSlug, intl)}
        groups={[
          {
            id: "hyperlocalise",
            title: nativeSectionTitle,
            accent: "workspace",
            count: nativeTotal,
            items: nativeGlossaries,
            query: nativeQuery,
            emptyTitle: nativeEmptyTitle,
            emptyDescription: nativeEmptyDescription,
            emptyAction: allowCreateGlossaries ? (
              <Button type="button" size="sm" onClick={() => onCreateDialogOpenChange(true)}>
                <FormattedMessage {...glossariesPageViewMessages.createGlossary} />
              </Button>
            ) : !hasConnectedProvider ? (
              <GlossariesEmptyAction organizationSlug={organizationSlug} />
            ) : undefined,
            hasMore: nativeHasMore,
            isLoadingMore: nativeIsLoadingMore,
            onLoadMore: onNativeLoadMore,
          },
          ...providerGroups.map((group, index) => ({
            id: group.id,
            title: group.title,
            accent: "provider" as const,
            count: liveProjectSelectionRequired ? 0 : group.items.length,
            items: group.items,
            query: liveProjectSelectionRequired
              ? { isLoading: false, isError: false, isSuccess: true, error: null }
              : externalQuery,
            emptyTitle: liveProjectSelectionRequired
              ? intl.formatMessage(glossariesPageViewMessages.chooseTmsProjectTitle)
              : !hasConnectedProvider
                ? intl.formatMessage(glossariesPageViewMessages.emptyTitleConnectProvider)
                : intl.formatMessage(glossariesPageViewMessages.externalEmptyTitle, {
                    provider: group.title,
                  }),
            emptyDescription: liveProjectSelectionRequired
              ? intl.formatMessage(glossariesPageViewMessages.chooseTmsProjectDescription)
              : !hasConnectedProvider
                ? intl.formatMessage(glossariesPageViewMessages.emptyDescriptionWithoutProvider)
                : useLiveCrowdinGlossaries
                  ? intl.formatMessage(glossariesPageViewMessages.crowdinEmptyDescription)
                  : intl.formatMessage(glossariesPageViewMessages.emptyDescriptionWithProvider, {
                      provider: group.title,
                    }),
            emptyAction: liveProjectSelectionRequired ? undefined : providerConnectAction,
            headerActions:
              liveProviderKind && group.id === liveProviderKind ? liveProviderControls : undefined,
            hasMore:
              !liveProjectSelectionRequired &&
              externalHasMore &&
              index === providerGroups.length - 1,
            isLoadingMore: externalIsLoadingMore,
            onLoadMore: onExternalLoadMore,
          })),
        ]}
      />

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
              <FieldError
                errors={
                  createErrors.projectIds ? [{ message: createErrors.projectIds }] : undefined
                }
              />
              <TypographyP size="xsmall" tone="subtle">
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
    </WorkspacePageShell>
  );
}
