"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Add01Icon, FolderKanbanIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";
import { getTmsProviderBranding } from "@/lib/providers/tms-provider-branding";

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
import { ProjectsTable } from "./projects-table";
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
        Recently opened
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
  const queryClient = useQueryClient();
  const [projectDialogMode, setProjectDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectListRow | null>(null);
  const [deleteProject, setDeleteProject] = useState<ProjectListRow | null>(null);
  const [sourceFilter, setSourceFilter] = useState<ProjectSourceFilter>("all");
  const [recentProjects, setRecentProjects] = useState<Array<{ id: string; name: string }>>([]);

  const nativeProjectsQuery = useQuery({
    queryKey: nativeProjectsQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });

      if (response.status !== 200) {
        throw await readApiResponseError(response, "Failed to load projects");
      }

      const body = await response.json();
      return body.projects.map(mapProjectToListRow);
    },
  });
  const activeTmsProviderQuery = useActiveTmsProvider(organizationSlug);
  const hasTmsConnection = Boolean(activeTmsProviderQuery.data);
  const tmsProjectsQuery = useQuery({
    queryKey: tmsLiveProjectsQueryKey(organizationSlug),
    enabled: hasTmsConnection,
    queryFn: () => fetchTmsLiveProjects(organizationSlug),
    select: (projects) => projects.map(mapProjectToListRow),
  });
  const createProject = useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$post({
        param: { organizationSlug },
        json: toProjectPayload(values, { mode: "create" }),
      });

      if (!response.ok) {
        throw await readApiResponseError(response, "Unable to create project");
      }

      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: nativeProjectsQueryKey(organizationSlug) });
      setProjectDialogMode(null);
      toast.success("Project created");
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
        throw await readApiResponseError(response, "Unable to update project");
      }

      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: nativeProjectsQueryKey(organizationSlug) });
      setProjectDialogMode(null);
      setEditingProject(null);
      toast.success("Project updated");
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
        throw await readApiResponseError(response, "Unable to delete project");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: nativeProjectsQueryKey(organizationSlug) });
      setDeleteProject(null);
      toast.success("Project deleted");
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
  const projectDialogTitle = projectDialogMode === "edit" ? "Edit project" : "Create project";
  const projectDialogDescription =
    projectDialogMode === "edit"
      ? "Update the metadata stored with this project."
      : "Add a project to track localization work and shared translation guidance.";
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
    (showNativeSection && filteredNativeProjects.length > 0) ||
    (showTmsSection && filteredTmsProjects.length > 0);
  const tmsProviderName = activeTmsProviderQuery.data
    ? getTmsProviderBranding(activeTmsProviderQuery.data.providerKind).name
    : "TMS";
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
    ? `Browse live ${tmsProviderName} projects and manage Hyperlocalise workspace projects.`
    : "Browse Hyperlocalise projects. Connect a TMS provider to view live provider projects alongside them.";

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
        Create native project
      </Button>
    ) : (
      <Button
        type="button"
        onClick={openCreateProjectDialog}
        className="w-full sm:w-fit"
        disabled={isSavingProject}
      >
        <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
        Create project
      </Button>
    );

  const tmsSection = showTmsSection ? (
    <section className="space-y-4">
      <ProjectsSectionHeader
        title={`${tmsProviderName} projects`}
        description="Live projects fetched from your connected TMS provider, ordered by recent activity."
      />
      <ProjectsTable
        projects={filteredTmsProjects}
        projectsQuery={tmsProjectsQuery}
        isSavingProject={isSavingProject}
        isDeletingProject={deleteProjectMutation.isPending}
        organizationSlug={organizationSlug}
        variant="tms"
        onOpenProject={handleOpenProject}
      />
    </section>
  ) : null;

  const nativeSection = showNativeSection ? (
    <section className="space-y-4">
      <ProjectsSectionHeader
        title="Hyperlocalise projects"
        description="Projects created and managed in this workspace."
      />
      <ProjectsTable
        projects={filteredNativeProjects}
        projectsQuery={nativeProjectsQuery}
        isSavingProject={isSavingProject}
        isDeletingProject={deleteProjectMutation.isPending}
        organizationSlug={organizationSlug}
        variant="native"
        compactEmptyNative={compactNativeEmpty}
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
          title="TMS projects"
          description="Connect a TMS provider to browse live provider projects here."
        />
        <div className="max-w-xl py-4">
          <Button
            nativeButton={false}
            render={<Link href={`/org/${organizationSlug}/integrations`} />}
            variant="outline"
            size="sm"
          >
            Connect a provider
          </Button>
        </div>
      </section>
    ) : null;

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={FolderKanbanIcon}
        label="Workspace"
        title="Projects"
        description={pageDescription}
        actions={createProjectAction}
      />

      {hasAnyProjects ? (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <WorkspaceFilterField label="Search" className="w-full sm:max-w-xs">
            <Input
              placeholder="Search by name..."
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
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="tms">{tmsProviderName}</TabsTrigger>
                <TabsTrigger value="native">Hyperlocalise</TabsTrigger>
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
          No projects match your search.{" "}
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="text-subtle-foreground underline hover:text-foreground"
          >
            Clear search
          </button>
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
