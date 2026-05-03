"use client";

import { useMemo, useState } from "react";
import { Add01Icon, FolderKanbanIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";

import { PageHeader } from "../../_components/workspace-resource-shared";
import { ArchiveProjectDialog } from "./archive-project-dialog";
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

async function readProjectError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);

  if (body && typeof body === "object" && "error" in body) {
    return String(body.error);
  }

  return fallback;
}

export function ProjectsPageContent({ organizationSlug }: { organizationSlug: string }) {
  const queryClient = useQueryClient();
  const [projectDialogMode, setProjectDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectListRow | null>(null);
  const [archiveProject, setArchiveProject] = useState<ProjectListRow | null>(null);
  const projectsQuery = useQuery({
    queryKey: projectQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });

      if (!response.ok) {
        throw new Error(`Failed to load projects (${response.status})`);
      }

      const body = await response.json();
      return body.projects.map(mapProjectToListRow);
    },
  });
  const createProject = useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$post({
        param: { organizationSlug },
        json: toProjectPayload(values),
      });

      if (!response.ok) {
        throw new Error(await readProjectError(response, "Unable to create project"));
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
        json: toProjectPayload(values),
      });

      if (!response.ok) {
        throw new Error(await readProjectError(response, "Unable to update project"));
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
  const archiveProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].$delete(
        {
          param: { organizationSlug, projectId },
        },
      );

      if (!response.ok) {
        throw new Error(await readProjectError(response, "Unable to archive project"));
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectQueryKey(organizationSlug) });
      setArchiveProject(null);
      toast.success("Project archived");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const projects = projectsQuery.data ?? [];
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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <PageHeader
          icon={FolderKanbanIcon}
          label="Workspace projects"
          title="Projects"
          description="Track localization programs by release, source, owner, and market readiness before they move into translation jobs."
        />
        <Button
          type="button"
          onClick={openCreateProjectDialog}
          className="w-full md:w-fit"
          disabled={isSavingProject}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
          Create project
        </Button>
      </div>
      <section>
        <ProjectsTable
          projects={projects}
          projectsQuery={projectsQuery}
          isSavingProject={isSavingProject}
          isArchivingProject={archiveProjectMutation.isPending}
          onCreateProject={openCreateProjectDialog}
          onEditProject={openEditProjectDialog}
          onArchiveProject={setArchiveProject}
        />
      </section>
      <ProjectDialog
        open={projectDialogMode !== null}
        title={projectDialogTitle}
        description={projectDialogDescription}
        initialValues={initialProjectValues}
        isSaving={isSavingProject}
        onOpenChange={closeProjectDialog}
        onSubmit={saveProject}
      />
      <ArchiveProjectDialog
        project={archiveProject}
        isArchiving={archiveProjectMutation.isPending}
        onOpenChange={(open) => {
          if (!open && !archiveProjectMutation.isPending) {
            setArchiveProject(null);
          }
        }}
        onArchive={archiveProjectMutation.mutate}
      />
    </div>
  );
}
