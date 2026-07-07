// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UseQueryResult } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vite-plus/test";

import { DeleteProjectDialog } from "./delete-project-dialog";
import type { ProjectListRow } from "./project-list";
import { ProjectsTable } from "./projects-table";

function createProject(overrides: Partial<ProjectListRow> = {}): ProjectListRow {
  return {
    id: "project_native",
    name: "Hyperlocalise Web",
    key: "HW",
    description: "No description",
    descriptionValue: "",
    translationContext: "No translation context",
    translationContextValue: "",
    created: "Apr 29, 2026",
    updated: "Apr 30, 2026",
    source: "native",
    externalProviderKind: null,
    externalProjectId: null,
    sourceLocale: "en",
    targetLocales: ["vi"],
    externalProjectUrl: null,
    isActive: true,
    logoUrl: null,
    lastActivityAt: null,
    lastSyncedAt: null,
    lastSyncErrorAt: null,
    lastSyncErrorMessage: null,
    openJobCount: 0,
    ...overrides,
  };
}

function successQuery(): UseQueryResult<ProjectListRow[], Error> {
  return {
    isError: false,
    isLoading: false,
    isSuccess: true,
  } as UseQueryResult<ProjectListRow[], Error>;
}

describe("ProjectsTable", () => {
  it("shows source-to-target locales for native and external project cards", () => {
    render(
      <>
        <ProjectsTable
          projects={[createProject()]}
          projectsQuery={successQuery()}
          isSavingProject={false}
          isDeletingProject={false}
          organizationSlug="acme"
          variant="native"
          onEditProject={vi.fn()}
          onDeleteProject={vi.fn()}
        />
        <ProjectsTable
          projects={[
            createProject({
              id: "project_crowdin",
              name: "Crowdin Site",
              key: "CS",
              source: "external_tms",
              externalProviderKind: "crowdin",
              externalProjectUrl: "https://crowdin.example/project",
              lastActivityAt: "2026-04-30T03:20:00.000Z",
            }),
          ]}
          projectsQuery={successQuery()}
          isSavingProject={false}
          isDeletingProject={false}
          organizationSlug="acme"
          variant="tms"
        />
      </>,
    );

    expect(screen.getByText("Hyperlocalise")).toBeInTheDocument();
    expect(screen.getByText("Crowdin")).toBeInTheDocument();
    expect(screen.getAllByText("en → vi")).toHaveLength(2);
  });

  it("opens native delete from the actions menu instead of a standalone icon button", async () => {
    const user = userEvent.setup();
    const onDeleteProject = vi.fn();
    const project = createProject();

    render(
      <ProjectsTable
        projects={[project]}
        projectsQuery={successQuery()}
        isSavingProject={false}
        isDeletingProject={false}
        organizationSlug="acme"
        variant="native"
        onEditProject={vi.fn()}
        onDeleteProject={onDeleteProject}
      />,
    );

    expect(
      screen.queryByRole("button", { name: `Delete ${project.name}` }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: `Actions for ${project.name}` }));
    await user.click(await screen.findByText("Delete project..."));

    expect(onDeleteProject).toHaveBeenCalledWith(project);
  });
});

describe("DeleteProjectDialog", () => {
  it("requires confirming before deleting the selected native project", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const project = createProject();

    render(
      <DeleteProjectDialog
        project={project}
        isDeleting={false}
        onOpenChange={vi.fn()}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByRole("alertdialog", { name: "Delete project?" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith(project.id);
  });
});
