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
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Add01Icon, FolderKanbanIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";
import { getTmsProviderBranding } from "@/lib/providers/shared/tms-provider-branding";

import {
  PageHeader,
  WorkspaceFilterField,
  WorkspacePageShell,
} from "../../_components/workspace-resource-shared";
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
import { PROJECTS_PAGE_SIZE, ProjectsTable } from "./projects-table";
import { projectsPageContentMessages } from "./projects-page-content.messages";
import { recordRecentProjectVisit, resolveRecentProjects } from "./recent-projects";

const nativeProjectsQueryKey = (organizationSlug: string) =>
  ["translation-projects", organizationSlug, "native"] as const;

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
      <TypographyP className="text-sm font-medium text-foreground">{title}</TypographyP>
      <TypographyP className="text-sm leading-6 text-muted-foreground">{description}</TypographyP>
    </div>
  );
}

function RecentProjectsStrip({
  organizationSlug,
  projects,
  onOpenProject,
}: {
  organizationSlug: string;
  projects: Array<{ id: string; name: string }>;
  onOpenProject: (projectId: string) => void;
}) {
  if (projects.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <TypographyP className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
        <FormattedMessage {...projectsPageContentMessages.recentlyOpened} />
      </TypographyP>
      <div className="flex flex-wrap gap-2">
        {projects.map((project) => (
          <Button
            key={project.id}
            nativeButton={false}
            render={
              <Link
                href={`/org/${organizationSlug}/projects/${project.id}`}
                onClick={() => onOpenProject(project.id)}
              />
            }
            variant="outline"
            size="sm"
            className="max-w-full"
          >
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

  const nativeProjects = nativeProjectsQuery.data ?? [];
  const tmsProjects = tmsProjectsQuery.data ?? [];
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
    ? intl.formatMessage(projectsPageContentMessages.pageDescriptionWithTms, {
        providerName: tmsProviderName,
      })
    : intl.formatMessage(projectsPageContentMessages.pageDescriptionWithoutTms);

  const createProjectAction =
    hasTmsPrimaryWorkflow && nativeProjects.length === 0 ? (
      <Button
        type="button"
        onClick={openCreateProjectDialog}
        variant="outline"
        className="w-full sm:w-fit"
        disabled={isSavingProject}
      >
        <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
        <FormattedMessage {...projectsPageContentMessages.createNativeProject} />
      </Button>
    ) : (
      <Button
        type="button"
        onClick={openCreateProjectDialog}
        className="w-full sm:w-fit"
        disabled={isSavingProject}
      >
        <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
        <FormattedMessage {...projectsPageContentMessages.createProject} />
      </Button>
    );

  const tmsSection = showTmsSection ? (
    <section className="space-y-4">
      <ProjectsSectionHeader
        title={intl.formatMessage(projectsPageContentMessages.tmsProjectsTitle, {
          providerName: tmsProviderName,
        })}
        description={intl.formatMessage(projectsPageContentMessages.tmsProjectsDescription)}
      />
      <ProjectsTable
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
    </section>
  ) : null;

  const nativeSection = showNativeSection ? (
    <section className="space-y-4">
      <ProjectsSectionHeader
        title={intl.formatMessage(projectsPageContentMessages.hyperlocaliseProjectsTitle)}
        description={intl.formatMessage(
          projectsPageContentMessages.hyperlocaliseProjectsDescription,
        )}
      />
      <ProjectsTable
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
    </section>
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
            render={<Link href={`/org/${organizationSlug}/integrations`} />}
            variant="outline"
            size="sm"
          >
            <FormattedMessage {...projectsPageContentMessages.connectProvider} />
          </Button>
        </div>
      </section>
    ) : null;

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={FolderKanbanIcon}
        label={intl.formatMessage(projectsPageContentMessages.pageLabel)}
        title={intl.formatMessage(projectsPageContentMessages.pageTitle)}
        description={pageDescription}
        actions={createProjectAction}
      />

      {hasAnyProjects ? (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <WorkspaceFilterField
            label={intl.formatMessage(projectsPageContentMessages.searchLabel)}
            className="w-full sm:max-w-xs"
          >
            <Input
              placeholder={intl.formatMessage(projectsPageContentMessages.searchPlaceholder)}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </WorkspaceFilterField>
          {hasTmsConnection ? (
            <Tabs
              value={sourceFilter}
              onValueChange={(value) => setSourceFilter(value as ProjectSourceFilter)}
            >
              <TabsList>
                <TabsTrigger value="all">
                  <FormattedMessage {...projectsPageContentMessages.filterAll} />
                </TabsTrigger>
                <TabsTrigger value="tms">{tmsProviderName}</TabsTrigger>
                <TabsTrigger value="native">
                  <FormattedMessage {...projectsPageContentMessages.filterHyperlocalise} />
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
          onOpenProject={handleOpenProject}
        />
      ) : null}

      {hasAnyProjects && !hasFilteredResults ? (
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

      <div className="space-y-10">
        {hasTmsConnection ? (
          <>
            {tmsSection}
            {nativeSection}
          </>
        ) : (
          <>
            {nativeSection}
            {connectTmsSection}
          </>
        )}
      </div>

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
