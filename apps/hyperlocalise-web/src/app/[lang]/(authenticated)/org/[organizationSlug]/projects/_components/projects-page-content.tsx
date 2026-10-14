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
import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { PlusIcon, SquaresFourIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";
import { projectsTableMessages } from "./projects-table.messages";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyP } from "@/components/ui/typography";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { getTmsProviderBranding } from "@/lib/providers/shared/tms-provider-branding";

import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { useActiveTmsProvider } from "../../_hooks/use-active-tms-provider";
import { fetchTmsLiveProjects, tmsLiveProjectsQueryKey } from "../../_hooks/use-tms-live-projects";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { ProjectAvatar } from "./project-avatar";
import { ProjectDialog } from "./project-dialog";
import {
  createEmptyProjectForm,
  createProjectFormFromRow,
  toProjectPayload,
  type ProjectFormValues,
} from "./project-form";
import { mapProjectToListRow, type ProjectListRow } from "./project-list";
import { ProjectsTable, ProjectsTableHeader } from "./projects-table";
import { projectsPageContentMessages } from "./projects-page-content.messages";
import { ProjectsPageStore, type ProjectSourceFilter } from "./projects-page-store";

const nativeProjectsQueryKey = (organizationSlug: string) =>
  ["translation-projects", organizationSlug, "native"] as const;

const EMPTY_PROJECTS: ProjectListRow[] = [];

function ProjectsSectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1">
      <TypographyP size="small" weight="medium" tone="content">
        {title}
      </TypographyP>
      <TypographyP className="leading-6" size="small" tone="subtle">
        {description}
      </TypographyP>
    </div>
  );
}

function RecentProjectsStrip({
  organizationSlug,
  projects,
  onOpenProject,
  allProjects,
}: {
  allProjects: ProjectListRow[];
  organizationSlug: string;
  projects: Array<{ id: string; name: string }>;
  onOpenProject: (projectId: string) => void;
}) {
  if (projects.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2.5">
      <TypographyP
        className="tracking-[0.08em]"
        size="xsmall"
        weight="medium"
        tone="subtle"
        capitalization="uppercase"
      >
        <FormattedMessage {...projectsPageContentMessages.recentlyOpened} />
      </TypographyP>
      <div className="flex flex-wrap gap-2">
        {projects.map((project) => (
          <Button
            key={project.id}
            nativeButton={false}
            render={
              <OrgNavLink
                href={`/org/${organizationSlug}/projects/${project.id}`}
                onClick={() => onOpenProject(project.id)}
              />
            }
            variant="outline"
            size="sm"
            className="max-w-full gap-2 rounded-lg bg-background"
          >
            <ProjectAvatar
              compact
              project={
                allProjects.find((row) => row.id === project.id) ?? {
                  name: project.name,
                  logoUrl: null,
                  source: "native",
                  externalProviderKind: null,
                }
              }
            />
            <span className="truncate">{project.name}</span>
          </Button>
        ))}
      </div>
    </section>
  );
}

export const ProjectsPageContent = observer(function ProjectsPageContent({
  organizationSlug,
}: {
  organizationSlug: string;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client: goSvcClient } = useGoSvcClient();
  const [pageStore] = useState(() => new ProjectsPageStore(organizationSlug));

  const nativeProjectsQuery = useQuery({
    queryKey: nativeProjectsQueryKey(organizationSlug),
    queryFn: async () => {
      try {
        const body = await goSvcClient.project.list(organizationSlug);
        return body.projects.map((project) => mapProjectToListRow(project, intl));
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(
            error,
            intl.formatMessage(projectsPageContentMessages.loadProjectsFailed),
          ),
          { cause: error },
        );
      }
    },
  });
  const activeTmsProviderQuery = useActiveTmsProvider(organizationSlug);
  const hasTmsConnection = Boolean(activeTmsProviderQuery.data);
  const tmsProjectsQuery = useQuery({
    queryKey: tmsLiveProjectsQueryKey(organizationSlug),
    enabled: hasTmsConnection,
    queryFn: () => fetchTmsLiveProjects(organizationSlug),
    select: (projects) => projects.map((project) => mapProjectToListRow(project, intl)),
  });
  const createProject = useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      try {
        return await goSvcClient.project.create(
          organizationSlug,
          toProjectPayload(values, { mode: "create" }),
        );
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(
            error,
            intl.formatMessage(projectsPageContentMessages.createProjectFailed),
          ),
          { cause: error },
        );
      }
    },
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: nativeProjectsQueryKey(organizationSlug) });
      pageStore.closeProjectDialog(false);
      toast.success(intl.formatMessage(projectsPageContentMessages.projectCreated));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const updateProject = useMutation({
    mutationFn: async ({ projectId, values }: { projectId: string; values: ProjectFormValues }) => {
      try {
        return await goSvcClient.project.update(
          organizationSlug,
          projectId,
          toProjectPayload(values, {
            mode: "edit",
            includeLocales: pageStore.editingProject?.source === "native",
            includeMetadata: pageStore.editingProject?.source === "native",
          }),
        );
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(
            error,
            intl.formatMessage(projectsPageContentMessages.updateProjectFailed),
          ),
          { cause: error },
        );
      }
    },
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: nativeProjectsQueryKey(organizationSlug) });
      pageStore.closeProjectDialog(false);
      toast.success(intl.formatMessage(projectsPageContentMessages.projectUpdated));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      try {
        await goSvcClient.project.delete(organizationSlug, projectId);
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(
            error,
            intl.formatMessage(projectsPageContentMessages.deleteProjectFailed),
          ),
          { cause: error },
        );
      }
    },
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: nativeProjectsQueryKey(organizationSlug) });
      pageStore.setDeleteProject(null);
      toast.success(intl.formatMessage(projectsPageContentMessages.projectDeleted));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const nativeProjects = nativeProjectsQuery.data ?? EMPTY_PROJECTS;
  const tmsProjects = tmsProjectsQuery.data ?? EMPTY_PROJECTS;
  const allProjects = useMemo(
    () => [...tmsProjects, ...nativeProjects],
    [nativeProjects, tmsProjects],
  );
  const filteredNativeProjects = pageStore.filterProjects(nativeProjects);
  const filteredTmsProjects = pageStore.filterProjects(tmsProjects);
  const visibleNativeProjects = filteredNativeProjects.slice(0, pageStore.nativeVisibleCount);
  const visibleTmsProjects = filteredTmsProjects.slice(0, pageStore.tmsVisibleCount);
  const hasMoreNativeProjects = visibleNativeProjects.length < filteredNativeProjects.length;
  const hasMoreTmsProjects = visibleTmsProjects.length < filteredTmsProjects.length;

  useEffect(() => {
    pageStore.syncRecentProjects(allProjects);
  }, [allProjects, pageStore]);

  const isSavingProject = createProject.isPending || updateProject.isPending;
  const projectDialogTitle =
    pageStore.projectDialogMode === "edit"
      ? intl.formatMessage(projectsPageContentMessages.editProjectTitle)
      : intl.formatMessage(projectsPageContentMessages.createProjectTitle);
  const projectDialogDescription =
    pageStore.projectDialogMode === "edit"
      ? intl.formatMessage(projectsPageContentMessages.editProjectDescription)
      : intl.formatMessage(projectsPageContentMessages.createProjectDescription);
  const initialProjectValues =
    pageStore.projectDialogMode === "edit" && pageStore.editingProject
      ? createProjectFormFromRow(pageStore.editingProject)
      : createEmptyProjectForm();

  const hasAnyProjects = nativeProjects.length > 0 || tmsProjects.length > 0;
  const isTmsProjectsLoading = tmsProjectsQuery.isLoading || tmsProjectsQuery.isFetching;
  const showTmsSection =
    (hasTmsConnection || isTmsProjectsLoading) &&
    (pageStore.sourceFilter === "all" || pageStore.sourceFilter === "tms");
  const showNativeSection = pageStore.sourceFilter === "all" || pageStore.sourceFilter === "native";
  const hasFilteredResults =
    (showNativeSection && visibleNativeProjects.length > 0) ||
    (showTmsSection && visibleTmsProjects.length > 0);
  const tmsProviderName = activeTmsProviderQuery.data
    ? getTmsProviderBranding(activeTmsProviderQuery.data.providerKind).name
    : intl.formatMessage(projectsPageContentMessages.tmsFallbackName);
  const hasTmsPrimaryWorkflow = hasTmsConnection && tmsProjects.length > 0;
  const compactNativeEmpty = hasTmsPrimaryWorkflow && nativeProjects.length === 0;

  function saveProject(values: ProjectFormValues) {
    if (pageStore.projectDialogMode === "edit" && pageStore.editingProject) {
      updateProject.mutate({ projectId: pageStore.editingProject.id, values });
      return;
    }

    createProject.mutate(values);
  }

  const createProjectAction =
    hasTmsPrimaryWorkflow && nativeProjects.length === 0 ? (
      <Button
        type="button"
        onClick={() => pageStore.openCreateProjectDialog()}
        variant="outline"
        className="w-full rounded-lg sm:w-fit"
        disabled={isSavingProject}
      >
        <PlusIcon />
        <FormattedMessage {...projectsPageContentMessages.createNativeProject} />
      </Button>
    ) : (
      <Button
        type="button"
        onClick={() => pageStore.openCreateProjectDialog()}
        className="w-full rounded-lg sm:w-fit"
        disabled={isSavingProject}
      >
        <PlusIcon />
        <FormattedMessage {...projectsPageContentMessages.createProject} />
      </Button>
    );

  const tmsSection = showTmsSection ? (
    <ProjectsTable
      grouped
      groupLabel={tmsProviderName}
      totalCount={filteredTmsProjects.length}
      suppressEmpty={Boolean(pageStore.searchQuery.trim())}
      projects={visibleTmsProjects}
      projectsQuery={tmsProjectsQuery}
      isSavingProject={isSavingProject}
      isDeletingProject={deleteProjectMutation.isPending}
      organizationSlug={organizationSlug}
      variant="tms"
      hasMore={hasMoreTmsProjects}
      onLoadMore={() => pageStore.loadMoreTmsProjects()}
      onOpenProject={(projectId) => pageStore.openProject(projectId, allProjects)}
    />
  ) : null;

  const nativeSection = showNativeSection ? (
    <ProjectsTable
      grouped
      groupLabel={intl.formatMessage(projectsPageContentMessages.filterHyperlocalise)}
      totalCount={filteredNativeProjects.length}
      suppressEmpty={Boolean(pageStore.searchQuery.trim())}
      projects={visibleNativeProjects}
      projectsQuery={nativeProjectsQuery}
      isSavingProject={isSavingProject}
      isDeletingProject={deleteProjectMutation.isPending}
      organizationSlug={organizationSlug}
      variant="native"
      compactEmptyNative={compactNativeEmpty}
      hasMore={hasMoreNativeProjects}
      onLoadMore={() => pageStore.loadMoreNativeProjects()}
      onEditProject={(project) => pageStore.openEditProjectDialog(project)}
      onDeleteProject={(project) => pageStore.setDeleteProject(project)}
      onCreateProject={() => pageStore.openCreateProjectDialog()}
      onOpenProject={(projectId) => pageStore.openProject(projectId, allProjects)}
    />
  ) : null;

  const connectTmsSection =
    !hasTmsConnection && !isTmsProjectsLoading && activeTmsProviderQuery.isSuccess ? (
      <section className="space-y-4">
        <ProjectsSectionHeader
          title={intl.formatMessage(projectsPageContentMessages.connectTmsTitle)}
          description={intl.formatMessage(projectsPageContentMessages.connectTmsDescription)}
        />
        <div className="max-w-xl py-4">
          <Button
            nativeButton={false}
            render={<OrgNavLink href={`/org/${organizationSlug}/integrations`} />}
            variant="outline"
            size="sm"
          >
            <FormattedMessage {...projectsPageContentMessages.connectProvider} />
          </Button>
        </div>
      </section>
    ) : null;

  return (
    <WorkspacePageShell className="min-w-0">
      <PageHeader
        icon={SquaresFourIcon}
        label={intl.formatMessage(projectsPageContentMessages.pageLabel)}
        title={intl.formatMessage(projectsPageContentMessages.pageTitle)}
        actions={createProjectAction}
      />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: projectsPageContentMessages.pageTitle,
            value: allProjects.length,
            ready:
              nativeProjectsQuery.isSuccess &&
              activeTmsProviderQuery.isSuccess &&
              (!hasTmsConnection || tmsProjectsQuery.isSuccess),
          },
          {
            label: projectsTableMessages.openJobsLabel,
            value: allProjects.reduce((total, project) => total + project.openJobCount, 0),
            ready:
              nativeProjectsQuery.isSuccess &&
              activeTmsProviderQuery.isSuccess &&
              (!hasTmsConnection || tmsProjectsQuery.isSuccess),
            accent: true,
          },
          {
            label: projectsTableMessages.nativeSource,
            value: nativeProjects.length,
            ready: nativeProjectsQuery.isSuccess,
          },
          {
            label: projectsPageContentMessages.tmsFallbackName,
            value: tmsProjects.length,
            ready:
              activeTmsProviderQuery.isSuccess && (!hasTmsConnection || tmsProjectsQuery.isSuccess),
          },
        ].map((metric) => (
          <div
            key={metric.label.id}
            className="rounded-lg border border-border bg-background px-4 py-3"
          >
            <dt className="text-[10px] leading-3 font-medium tracking-[0.08em] text-muted-foreground uppercase">
              <FormattedMessage {...metric.label} />
            </dt>
            <dd
              className={cn(
                "mt-0.5 text-xl leading-6 font-medium tabular-nums",
                metric.accent && "text-primary",
              )}
            >
              {metric.ready ? intl.formatNumber(metric.value) : "—"}
            </dd>
          </div>
        ))}
      </dl>

      {hasAnyProjects ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-90">
            <MagnifyingGlassIcon
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-2.5 size-4 text-muted-foreground"
            />
            <Input
              aria-label={intl.formatMessage(projectsPageContentMessages.searchLabel)}
              placeholder={intl.formatMessage(projectsPageContentMessages.searchPlaceholder)}
              value={pageStore.searchQuery}
              onChange={(e) => pageStore.setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-lg ps-9"
            />
          </div>
          {hasTmsConnection ? (
            <Tabs
              value={pageStore.sourceFilter}
              onValueChange={(value) => pageStore.setSourceFilter(value as ProjectSourceFilter)}
            >
              <TabsList className="max-w-full gap-1 rounded-lg p-1">
                <TabsTrigger className="rounded-md px-3 data-active:border-border" value="all">
                  <FormattedMessage {...projectsPageContentMessages.filterAll} />
                </TabsTrigger>
                <TabsTrigger className="rounded-md px-3 data-active:border-border" value="native">
                  <FormattedMessage {...projectsPageContentMessages.filterHyperlocalise} />
                </TabsTrigger>
                <TabsTrigger className="rounded-md px-3 data-active:border-border" value="tms">
                  {tmsProviderName}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}
        </div>
      ) : null}

      {hasAnyProjects ? (
        <RecentProjectsStrip
          organizationSlug={organizationSlug}
          projects={pageStore.recentProjects}
          allProjects={allProjects}
          onOpenProject={(projectId) => pageStore.openProject(projectId, allProjects)}
        />
      ) : null}

      {hasAnyProjects &&
      pageStore.searchQuery.trim() &&
      !hasFilteredResults &&
      !nativeProjectsQuery.isLoading &&
      !isTmsProjectsLoading ? (
        <div className="border-t border-border px-1 py-8 text-sm text-muted-foreground">
          <FormattedMessage
            {...projectsPageContentMessages.noSearchResults}
            values={{
              clear: (chunks) => (
                <button
                  type="button"
                  onClick={() => pageStore.setSearchQuery("")}
                  className="text-subtle-foreground underline hover:text-foreground"
                >
                  {chunks}
                </button>
              ),
            }}
          />
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table
          className="w-full min-w-180 table-fixed"
          aria-label={intl.formatMessage(projectsPageContentMessages.pageTitle)}
        >
          <ProjectsTableHeader />
          {nativeSection}
          {tmsSection}
        </table>
      </div>
      {connectTmsSection}

      <ProjectDialog
        open={pageStore.isProjectDialogOpen}
        title={projectDialogTitle}
        description={projectDialogDescription}
        mode={pageStore.projectDialogMode === "edit" ? "edit" : "create"}
        projectSource={pageStore.editingProject?.source ?? "native"}
        initialValues={initialProjectValues}
        isSaving={isSavingProject}
        onOpenChange={(open) => pageStore.closeProjectDialog(open)}
        onSubmit={saveProject}
      />
      <DeleteProjectDialog
        project={pageStore.deleteProject}
        isDeleting={deleteProjectMutation.isPending}
        onOpenChange={(open) => {
          if (!open && !deleteProjectMutation.isPending) {
            pageStore.setDeleteProject(null);
          }
        }}
        onDelete={deleteProjectMutation.mutate}
      />
    </WorkspacePageShell>
  );
});
