"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { readApiResponseError } from "@/lib/api-error";

import {
  PROJECT_SOURCE_FILTERS,
  readWorkspaceFilterParam,
  TMS_PROVIDER_KINDS,
} from "../../_components/workspace-filter-params";
import {
  PageHeader,
  WorkspaceFilterField,
  WorkspacePageShell,
  workspaceFilterTriggerClassName,
} from "../../_components/workspace-resource-shared";
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

const sourceFilterLabels = {
  all: "All sources",
  native: "Native",
  external_tms: "External TMS",
} as const;

const providerFilterLabels = {
  all: "All providers",
  phrase: "Phrase",
  crowdin: "Crowdin",
  smartling: "Smartling",
  lokalise: "Lokalise",
} as const;

const statusFilterLabels = {
  all: "All statuses",
  active: "Active",
  inactive: "Inactive",
} as const;

function useProjectFilters(projects: ProjectListRow[], searchParams: URLSearchParams) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState(() =>
    readWorkspaceFilterParam(searchParams, "source", PROJECT_SOURCE_FILTERS),
  );
  const [providerFilter, setProviderFilter] = useState(() =>
    readWorkspaceFilterParam(searchParams, "provider", TMS_PROVIDER_KINDS),
  );
  const [statusFilter, setStatusFilter] = useState(() =>
    readWorkspaceFilterParam(searchParams, "status", ["active", "inactive"]),
  );

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
  const searchParams = useSearchParams();
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
  } = useProjectFilters(projects, searchParams);

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
    <WorkspacePageShell>
      <PageHeader
        icon={FolderKanbanIcon}
        label="Workspace"
        title="Projects"
        description="Track localization programs by release, source, owner, and market readiness before they move into translation jobs."
        actions={
          hasExternalProjects ? null : (
            <Button
              type="button"
              onClick={openCreateProjectDialog}
              className="w-full sm:w-fit"
              disabled={isSavingProject}
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
              Create project
            </Button>
          )
        }
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
          <WorkspaceFilterField label="Source" className="w-full sm:w-40">
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
              <SelectTrigger className={workspaceFilterTriggerClassName}>
                <SelectValue>
                  {sourceFilterLabels[sourceFilter as keyof typeof sourceFilterLabels] ??
                    sourceFilter}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" label={sourceFilterLabels.all}>
                  {sourceFilterLabels.all}
                </SelectItem>
                <SelectItem value="native" label={sourceFilterLabels.native}>
                  {sourceFilterLabels.native}
                </SelectItem>
                <SelectItem value="external_tms" label={sourceFilterLabels.external_tms}>
                  {sourceFilterLabels.external_tms}
                </SelectItem>
              </SelectContent>
            </Select>
          </WorkspaceFilterField>

          {hasExternalProjects && sourceFilter !== "native" ? (
            <WorkspaceFilterField label="Provider" className="w-full sm:w-40">
              <Select
                value={providerFilter}
                onValueChange={(value) => setProviderFilter(value ?? "all")}
              >
                <SelectTrigger className={workspaceFilterTriggerClassName}>
                  <SelectValue>
                    {providerFilterLabels[providerFilter as keyof typeof providerFilterLabels] ??
                      providerFilter}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" label={providerFilterLabels.all}>
                    {providerFilterLabels.all}
                  </SelectItem>
                  <SelectItem value="phrase" label={providerFilterLabels.phrase}>
                    {providerFilterLabels.phrase}
                  </SelectItem>
                  <SelectItem value="crowdin" label={providerFilterLabels.crowdin}>
                    {providerFilterLabels.crowdin}
                  </SelectItem>
                  <SelectItem value="smartling" label={providerFilterLabels.smartling}>
                    {providerFilterLabels.smartling}
                  </SelectItem>
                  <SelectItem value="lokalise" label={providerFilterLabels.lokalise}>
                    {providerFilterLabels.lokalise}
                  </SelectItem>
                </SelectContent>
              </Select>
            </WorkspaceFilterField>
          ) : null}

          {hasExternalProjects && sourceFilter !== "native" ? (
            <WorkspaceFilterField label="Status" className="w-full sm:w-40">
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value ?? "all")}
              >
                <SelectTrigger className={workspaceFilterTriggerClassName}>
                  <SelectValue>
                    {statusFilterLabels[statusFilter as keyof typeof statusFilterLabels] ??
                      statusFilter}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" label={statusFilterLabels.all}>
                    {statusFilterLabels.all}
                  </SelectItem>
                  <SelectItem value="active" label={statusFilterLabels.active}>
                    {statusFilterLabels.active}
                  </SelectItem>
                  <SelectItem value="inactive" label={statusFilterLabels.inactive}>
                    {statusFilterLabels.inactive}
                  </SelectItem>
                </SelectContent>
              </Select>
            </WorkspaceFilterField>
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
