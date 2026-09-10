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
import { useCallback, useEffect, useMemo, useState } from "react";
import { Add01Icon, GridViewIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";
import { projectsTableMessages } from "./projects-table.messages";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";
import { getTmsProviderBranding } from "@/lib/providers/shared/tms-provider-branding";

import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { useActiveTmsProvider } from "../../_hooks/use-active-tms-provider";
import { fetchTmsLiveProjects, tmsLiveProjectsQueryKey } from "../../_hooks/use-tms-live-projects";
import { DeleteProjectDialog } from "./delete-project-dialog";
import {
  createEmptyProjectForm,
  createProjectFormFromRow,
  toProjectPayload,
  type ProjectFormValues,
} from "./project-form";
import { ProjectDialog } from "./project-dialog";
import { mapProjectToListRow, type ProjectListRow } from "./project-list";
import { ProjectAvatar } from "./project-avatar";
import {
  PROJECTS_PAGE_SIZE,
  ProjectsTable,
  ProjectsTableHeader,
} from "./projects-table";
import { projectsPageContentMessages } from "./projects-page-content.messages";
import { recordRecentProjectVisit, resolveRecentProjects } from "./recent-projects";

const nativeProjectsQueryKey = (organizationSlug: string) =>
  ["translation-projects", organizationSlug, "native"] as const;

const EMPTY_PROJECTS: ProjectListRow[] = [];

type ProjectSourceFilter = "all" | "tms" | "native";

function useProjectSearch(projects: ProjectListRow[]) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return projects;

    return projects.filter((project) => {
      const matchesName = project.name.toLowerCase().includes(query);
      const matchesId = project.id.toLowerCase().includes(query);
      return matchesName || matchesId;
    });
  }, [projects, searchQuery]);

  return {
    searchQuery,
    setSearchQuery,
    filteredProjects,
  };
}

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

export function ProjectsPageContent({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [projectDialogMode, setProjectDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectListRow | null>(null);
  const [deleteProject, setDeleteProject] = useState<ProjectListRow | null>(null);
  const [sourceFilter, setSourceFilter] = useState<ProjectSourceFilter>("all");
  const [recentProjects, setRecentProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [nativeVisibleCount, setNativeVisibleCount] = useState(PROJECTS_PAGE_SIZE);
  const [tmsVisibleCount, setTmsVisibleCount] = useState(PROJECTS_PAGE_SIZE);

  const nativeProjectsQuery = useQuery({
    queryKey: nativeProjectsQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });

      if (response.status !== 200) {
        throw await readApiResponseError(
          response,
          intl.formatMessage(projectsPageContentMessages.loadProjectsFailed),
        );
      }

      const body = await response.json();
      return body.projects.map((project) => mapProjectToListRow(project, intl));
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
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$post({
        param: { organizationSlug },
        json: toProjectPayload(values, { mode: "create" }),
      });

      if (!response.ok) {
        throw await readApiResponseError(
          response,
          intl.formatMessage(projectsPageContentMessages.createProjectFailed),
        );
      }

      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: nativeProjectsQueryKey(organizationSlug) });
      setProjectDialogMode(null);
      toast.success(intl.formatMessage(projectsPageContentMessages.projectCreated));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const updateProject = useMutation({
    mutationFn: async ({ projectId, values }: { projectId: string; values: ProjectFormValues }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].$patch({
        param: { organizationSlug, projectId },
        json: toProjectPayload(values, {
          mode: "edit",
          includeLocales: editingProject?.source === "native",
          includeMetadata: editingProject?.source === "native",
        }),
      });

      if (!response.ok) {
        throw await readApiResponseError(
          response,
          intl.formatMessage(projectsPageContentMessages.updateProjectFailed),
        );
      }

      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: nativeProjectsQueryKey(organizationSlug) });
      setProjectDialogMode(null);
      setEditingProject(null);
      toast.success(intl.formatMessage(projectsPageContentMessages.projectUpdated));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].$delete(
        {
          param: { organizationSlug, projectId },
        },
      );

      if (!response.ok) {
        throw await readApiResponseError(
          response,
          intl.formatMessage(projectsPageContentMessages.deleteProjectFailed),
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: nativeProjectsQueryKey(organizationSlug) });
      setDeleteProject(null);
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
  const {
    searchQuery,
    setSearchQuery,
    filteredProjects: filteredNativeProjects,
  } = useProjectSearch(nativeProjects);
  const filteredTmsProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return tmsProjects;

    return tmsProjects.filter((project) => {
      const matchesName = project.name.toLowerCase().includes(query);
      const matchesId = project.id.toLowerCase().includes(query);
      return matchesName || matchesId;
    });
  }, [searchQuery, tmsProjects]);

  useEffect(() => {
    setNativeVisibleCount(PROJECTS_PAGE_SIZE);
    setTmsVisibleCount(PROJECTS_PAGE_SIZE);
  }, [searchQuery, sourceFilter]);

  const visibleNativeProjects = filteredNativeProjects.slice(0, nativeVisibleCount);
  const visibleTmsProjects = filteredTmsProjects.slice(0, tmsVisibleCount);
  const hasMoreNativeProjects = visibleNativeProjects.length < filteredNativeProjects.length;
  const hasMoreTmsProjects = visibleTmsProjects.length < filteredTmsProjects.length;

  const loadMoreNativeProjects = useCallback(() => {
    setNativeVisibleCount((current) => current + PROJECTS_PAGE_SIZE);
  }, []);

  const loadMoreTmsProjects = useCallback(() => {
    setTmsVisibleCount((current) => current + PROJECTS_PAGE_SIZE);
  }, []);

  const handleOpenProject = useCallback(
    (projectId: string) => {
      recordRecentProjectVisit(organizationSlug, projectId);
      setRecentProjects(resolveRecentProjects(organizationSlug, allProjects));
    },
    [allProjects, organizationSlug],
  );

  useEffect(() => {
    setRecentProjects(resolveRecentProjects(organizationSlug, allProjects));
  }, [allProjects, organizationSlug]);

  const isSavingProject = createProject.isPending || updateProject.isPending;
  const projectDialogTitle =
    projectDialogMode === "edit"
      ? intl.formatMessage(projectsPageContentMessages.editProjectTitle)
      : intl.formatMessage(projectsPageContentMessages.createProjectTitle);
  const projectDialogDescription =
    projectDialogMode === "edit"
      ? intl.formatMessage(projectsPageContentMessages.editProjectDescription)
      : intl.formatMessage(projectsPageContentMessages.createProjectDescription);
  const initialProjectValues = useMemo(
    () =>
      projectDialogMode === "edit" && editingProject
        ? createProjectFormFromRow(editingProject)
        : createEmptyProjectForm(),
    [editingProject, projectDialogMode],
  );

  const hasAnyProjects = nativeProjects.length > 0 || tmsProjects.length > 0;
  const isTmsProjectsLoading = tmsProjectsQuery.isLoading || tmsProjectsQuery.isFetching;
  const showTmsSection =
    (hasTmsConnection || isTmsProjectsLoading) &&
    (sourceFilter === "all" || sourceFilter === "tms");
  const showNativeSection = sourceFilter === "all" || sourceFilter === "native";
  const hasFilteredResults =
    (showNativeSection && visibleNativeProjects.length > 0) ||
    (showTmsSection && visibleTmsProjects.length > 0);
  const tmsProviderName = activeTmsProviderQuery.data
    ? getTmsProviderBranding(activeTmsProviderQuery.data.providerKind).name
    : intl.formatMessage(projectsPageContentMessages.tmsFallbackName);
  const hasTmsPrimaryWorkflow = hasTmsConnection && tmsProjects.length > 0;
  const compactNativeEmpty = hasTmsPrimaryWorkflow && nativeProjects.length === 0;

  function openCreateProjectDialog() {
    setEditingProject(null);
    setProjectDialogMode("create");
  }

  function openEditProjectDialog(project: ProjectListRow) {
    setEditingProject(project);
    setProjectDialogMode("edit");
  }

  function closeProjectDialog(open: boolean) {
    if (open) {
      return;
    }

    setProjectDialogMode(null);
    setEditingProject(null);
  }

  function saveProject(values: ProjectFormValues) {
    if (projectDialogMode === "edit" && editingProject) {
      updateProject.mutate({ projectId: editingProject.id, values });
      return;
    }

    createProject.mutate(values);
  }

  const pageDescription = hasTmsConnection
    ? intl.formatMessage(projectsPageContentMessages.pageDescriptionWithTms)
    : intl.formatMessage(projectsPageContentMessages.pageDescriptionWithoutTms);

  const createProjectAction =
    hasTmsPrimaryWorkflow && nativeProjects.length === 0 ? (
      <Button
        type="button"
        onClick={openCreateProjectDialog}
        variant="outline"
        className="w-full rounded-lg sm:w-fit"
        disabled={isSavingProject}
      >
        <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
        <FormattedMessage {...projectsPageContentMessages.createNativeProject} />
      </Button>
    ) : (
      <Button
        type="button"
        onClick={openCreateProjectDialog}
        className="w-full rounded-lg sm:w-fit"
        disabled={isSavingProject}
      >
        <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
        <FormattedMessage {...projectsPageContentMessages.createProject} />
      </Button>
    );

  const tmsSection = showTmsSection ? (
    <ProjectsTable
      grouped
      groupLabel={tmsProviderName}
      totalCount={filteredTmsProjects.length}
      suppressEmpty={Boolean(searchQuery.trim())}
      projects={visibleTmsProjects}
      projectsQuery={tmsProjectsQuery}
      isSavingProject={isSavingProject}
      isDeletingProject={deleteProjectMutation.isPending}
      organizationSlug={organizationSlug}
      variant="tms"
      hasMore={hasMoreTmsProjects}
      onLoadMore={loadMoreTmsProjects}
      onOpenProject={handleOpenProject}
    />
  ) : null;

  const nativeSection = showNativeSection ? (
    <ProjectsTable
      grouped
      groupLabel={intl.formatMessage(projectsPageContentMessages.filterHyperlocalise)}
      totalCount={filteredNativeProjects.length}
      suppressEmpty={Boolean(searchQuery.trim())}
      projects={visibleNativeProjects}
      projectsQuery={nativeProjectsQuery}
      isSavingProject={isSavingProject}
      isDeletingProject={deleteProjectMutation.isPending}
      organizationSlug={organizationSlug}
      variant="native"
      compactEmptyNative={compactNativeEmpty}
      hasMore={hasMoreNativeProjects}
      onLoadMore={loadMoreNativeProjects}
      onEditProject={openEditProjectDialog}
      onDeleteProject={setDeleteProject}
      onCreateProject={openCreateProjectDialog}
      onOpenProject={handleOpenProject}
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
    <WorkspacePageShell className="min-w-0 p-4 md:px-8 md:pt-6 md:pb-8 [&>section:first-child]:md:items-start">
      <PageHeader
        icon={GridViewIcon}
        label={intl.formatMessage(projectsPageContentMessages.pageLabel)}
        title={intl.formatMessage(projectsPageContentMessages.pageTitle)}
        description={pageDescription}
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
            <HugeiconsIcon
              icon={Search01Icon}
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-2.5 size-4 text-muted-foreground"
            />
            <Input
              aria-label={intl.formatMessage(projectsPageContentMessages.searchLabel)}
              placeholder={intl.formatMessage(projectsPageContentMessages.searchPlaceholder)}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-lg ps-9"
            />
          </div>
          {hasTmsConnection ? (
            <Tabs
              value={sourceFilter}
              onValueChange={(value) => setSourceFilter(value as ProjectSourceFilter)}
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
          projects={recentProjects}
          allProjects={allProjects}
          onOpenProject={handleOpenProject}
        />
      ) : null}

      {hasAnyProjects &&
      searchQuery.trim() &&
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
                  onClick={() => setSearchQuery("")}
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
        open={projectDialogMode !== null}
        title={projectDialogTitle}
        description={projectDialogDescription}
        mode={projectDialogMode === "edit" ? "edit" : "create"}
        projectSource={editingProject?.source ?? "native"}
        initialValues={initialProjectValues}
        isSaving={isSavingProject}
        onOpenChange={closeProjectDialog}
        onSubmit={saveProject}
      />
      <DeleteProjectDialog
        project={deleteProject}
        isDeleting={deleteProjectMutation.isPending}
        onOpenChange={(open) => {
          if (!open && !deleteProjectMutation.isPending) {
            setDeleteProject(null);
          }
        }}
        onDelete={deleteProjectMutation.mutate}
      />
    </WorkspacePageShell>
  );
}
