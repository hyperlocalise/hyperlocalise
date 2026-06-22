"use client";

import { useMemo, useState } from "react";
import { Add01Icon, DatabaseSyncIcon, FolderKanbanIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";

import {
  PageHeader,
  WorkspaceFilterField,
  WorkspacePageShell,
} from "../../_components/workspace-resource-shared";
import { useActiveTmsProvider } from "../../_hooks/use-active-tms-provider";
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

const projectQueryKey = (organizationSlug: string) => ["translation-projects", organizationSlug];

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

export function ProjectsPageContent({ organizationSlug }: { organizationSlug: string }) {
  const queryClient = useQueryClient();
  const [projectDialogMode, setProjectDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectListRow | null>(null);
  const [deleteProject, setDeleteProject] = useState<ProjectListRow | null>(null);
  const projectsQuery = useQuery({
    queryKey: projectQueryKey(organizationSlug),
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
      await queryClient.invalidateQueries({ queryKey: projectQueryKey(organizationSlug) });
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
      await queryClient.invalidateQueries({ queryKey: projectQueryKey(organizationSlug) });
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
      await queryClient.invalidateQueries({ queryKey: projectQueryKey(organizationSlug) });
      setDeleteProject(null);
      toast.success("Project deleted");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const syncProviderProjects = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"][
        "tms-provider"
      ].projects.sync.$post({
        param: { organizationSlug },
      });

      if (response.status !== 202) {
        throw await readApiResponseError(response, "Unable to sync provider projects");
      }

      return response.json();
    },
    onSuccess: async (body) => {
      await queryClient.invalidateQueries({ queryKey: projectQueryKey(organizationSlug) });
      toast.success(
        body.providerProjectSync.created ? "Project sync queued" : "Project sync is already queued",
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const projects = projectsQuery.data ?? [];
  const { searchQuery, setSearchQuery, filteredProjects } = useProjectSearch(projects);

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

  const useLiveProviderProjects = Boolean(activeTmsProviderQuery.data);
  const isProviderModeResolved = activeTmsProviderQuery.isSuccess;

  const createProjectAction = (
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

  const syncProjectsAction = useLiveProviderProjects ? (
    <Button
      type="button"
      variant="outline"
      className="w-full sm:w-fit"
      onClick={() => syncProviderProjects.mutate()}
      disabled={syncProviderProjects.isPending}
    >
      {syncProviderProjects.isPending ? (
        <Spinner className="size-4" />
      ) : (
        <HugeiconsIcon icon={DatabaseSyncIcon} strokeWidth={1.8} />
      )}
      Sync projects
    </Button>
  ) : null;

  const headerActions = !isProviderModeResolved ? null : (
    <>
      {syncProjectsAction}
      {createProjectAction}
    </>
  );

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={FolderKanbanIcon}
        label="Workspace"
        title="Projects"
        description="Track localization programs before they move into translation jobs."
        actions={headerActions}
      />

      {projectsQuery.isSuccess && projects.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-2">
          <WorkspaceFilterField label="Search" className="w-full sm:max-w-xs">
            <Input
              placeholder="Name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </WorkspaceFilterField>
        </div>
      ) : null}

      {projectsQuery.isSuccess && projects.length > 0 && filteredProjects.length === 0 ? (
        <div className="border-t border-foreground/8 px-1 py-8 text-sm text-foreground/52">
          No projects match your search.{" "}
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="text-foreground/72 underline hover:text-foreground"
          >
            Clear search
          </button>
        </div>
      ) : null}

      <section>
        <ProjectsTable
          projects={filteredProjects}
          projectsQuery={projectsQuery}
          isSavingProject={isSavingProject}
          isDeletingProject={deleteProjectMutation.isPending}
          hasActiveTmsConnection={Boolean(activeTmsProviderQuery.data)}
          isCheckingTmsConnection={
            activeTmsProviderQuery.isLoading && projectsQuery.isSuccess && projects.length === 0
          }
          isSyncingProviderProjects={syncProviderProjects.isPending}
          organizationSlug={organizationSlug}
          onSyncProviderProjects={syncProviderProjects.mutate}
          onEditProject={openEditProjectDialog}
          onDeleteProject={setDeleteProject}
        />
      </section>
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
