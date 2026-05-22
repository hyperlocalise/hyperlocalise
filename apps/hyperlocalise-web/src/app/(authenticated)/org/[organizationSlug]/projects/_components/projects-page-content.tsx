"use client";

import { useMemo, useState } from "react";
import { Add01Icon, FolderKanbanIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api-client-instance";

import { PageHeader } from "../../_components/workspace-resource-shared";
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

async function readProjectError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);

  if (body && typeof body === "object" && "error" in body) {
    return String(body.error);
  }

  return fallback;
}

function useProjectFilters(projects: ProjectListRow[]) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = project.name.toLowerCase().includes(query);
        const matchesId = project.id.toLowerCase().includes(query);
        if (!matchesName && !matchesId) return false;
      }

      if (sourceFilter !== "all") {
        if (project.source !== sourceFilter) return false;
      }

      if (providerFilter !== "all") {
        if (project.externalProviderKind !== providerFilter) return false;
      }

      if (statusFilter !== "all") {
        const isActive = statusFilter === "active";
        if (project.isActive !== isActive) return false;
      }

      return true;
    });
  }, [projects, searchQuery, sourceFilter, providerFilter, statusFilter]);

  const activeFilterCount = [sourceFilter, providerFilter, statusFilter].filter(
    (f) => f !== "all",
  ).length;

  return {
    searchQuery,
    setSearchQuery,
    sourceFilter,
    setSourceFilter,
    providerFilter,
    setProviderFilter,
    statusFilter,
    setStatusFilter,
    filteredProjects,
    activeFilterCount,
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
  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].$delete(
        {
          param: { organizationSlug, projectId },
        },
      );

      if (!response.ok) {
        throw new Error(await readProjectError(response, "Unable to delete project"));
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

  const projects = projectsQuery.data ?? [];
  const {
    searchQuery,
    setSearchQuery,
    sourceFilter,
    setSourceFilter,
    providerFilter,
    setProviderFilter,
    statusFilter,
    setStatusFilter,
    filteredProjects,
    activeFilterCount,
  } = useProjectFilters(projects);

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

  const hasExternalProjects = projects.some((p) => p.source === "external_tms");

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

      {projectsQuery.isSuccess && projects.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              placeholder="Search by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:max-w-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={sourceFilter}
              onValueChange={(value) => {
                setSourceFilter(value ?? "all");
                if (value === "native") {
                  setProviderFilter("all");
                  setStatusFilter("all");
                }
              }}
            >
              <SelectTrigger className="w-fit min-w-[8rem]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="native">Native</SelectItem>
                <SelectItem value="external_tms">External TMS</SelectItem>
              </SelectContent>
            </Select>

            {hasExternalProjects && sourceFilter !== "native" ? (
              <Select
                value={providerFilter}
                onValueChange={(value) => setProviderFilter(value ?? "all")}
              >
                <SelectTrigger className="w-fit min-w-[8rem]">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All providers</SelectItem>
                  <SelectItem value="phrase">Phrase</SelectItem>
                  <SelectItem value="crowdin">Crowdin</SelectItem>
                  <SelectItem value="smartling">Smartling</SelectItem>
                  <SelectItem value="lokalise">Lokalise</SelectItem>
                </SelectContent>
              </Select>
            ) : null}

            {hasExternalProjects && sourceFilter !== "native" ? (
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value ?? "all")}
              >
                <SelectTrigger className="w-fit min-w-[8rem]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            ) : null}

            {activeFilterCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSourceFilter("all");
                  setProviderFilter("all");
                  setStatusFilter("all");
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {projectsQuery.isSuccess && projects.length > 0 && filteredProjects.length === 0 ? (
        <div className="border-t border-foreground/8 px-1 py-8 text-sm text-foreground/52">
          No projects match your filters.{" "}
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSourceFilter("all");
              setProviderFilter("all");
              setStatusFilter("all");
            }}
            className="text-foreground/72 underline hover:text-foreground"
          >
            Clear filters
          </button>
        </div>
      ) : null}

      <section>
        <ProjectsTable
          projects={filteredProjects}
          projectsQuery={projectsQuery}
          isSavingProject={isSavingProject}
          isDeletingProject={deleteProjectMutation.isPending}
          organizationSlug={organizationSlug}
          onCreateProject={openCreateProjectDialog}
          onEditProject={openEditProjectDialog}
          onDeleteProject={setDeleteProject}
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
    </div>
  );
}
