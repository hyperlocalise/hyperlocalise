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
// @vitest-environment happy-dom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ProjectListRow } from "./project-list";
import { ProjectsTable } from "./projects-table";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/org/acme/projects",
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubLoadedImages() {
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      complete = true;
      naturalWidth = 16;
      referrerPolicy = "";
      crossOrigin: string | null = null;
      set src(_value: string) {
        this.onload?.();
      }
    },
  );
}

function renderWithIntl(ui: ReactElement) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      {ui}
    </IntlProvider>,
  );
}

function createProject(overrides: Partial<ProjectListRow> = {}): ProjectListRow {
  return {
    id: "project_native",
    name: "Hyperlocalise Web",
    key: "HW",
    identifier: "HW",
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
  it("shows source badges and accessible locale routes for native and external rows", () => {
    renderWithIntl(
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

    expect(screen.getByText("Native")).toBeInTheDocument();
    expect(screen.getByText("Crowdin")).toBeInTheDocument();
    expect(screen.getByTitle("Hyperlocalise Web")).toHaveTextContent("HW");
    expect(screen.getByTitle("Crowdin Site")).toHaveTextContent("CS");
    expect(screen.queryByText("H")).not.toBeInTheDocument();
    expect(screen.queryByText("C")).not.toBeInTheDocument();
    expect(screen.getAllByText("en → vi")).toHaveLength(2);
  });

  it("opens native delete from the actions menu instead of a standalone icon button", async () => {
    const user = userEvent.setup();
    const onDeleteProject = vi.fn();
    const project = createProject();

    renderWithIntl(
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
  it("shows numeric counts with a working jobs link and loads more within its group", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    const onOpenProject = vi.fn();
    renderWithIntl(
      <ProjectsTable
        projects={[createProject({ openJobCount: 3, targetLocales: ["vi", "fr"] })]}
        projectsQuery={successQuery()}
        organizationSlug="acme"
        variant="native"
        isSavingProject={false}
        isDeletingProject={false}
        groupLabel="Hyperlocalise"
        totalCount={15}
        hasMore
        onLoadMore={onLoadMore}
        onOpenProject={onOpenProject}
      />,
    );
    expect(screen.getByText("15 projects")).toBeInTheDocument();
    const row = screen.getByRole("link", { name: "Hyperlocalise Web" }).closest("tr")!;
    expect(within(row).getByTitle("en → vi, fr")).toHaveTextContent("2");
    expect(within(row).getByRole("link", { name: "3 jobs" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_native/jobs",
    );
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("link", { name: "Hyperlocalise Web" }));
    expect(onOpenProject).toHaveBeenCalledWith("project_native");
  });

  it("renders a project image when the TMS project has a logo", () => {
    stubLoadedImages();
    renderWithIntl(
      <ProjectsTable
        projects={[
          createProject({
            id: "project_crowdin",
            name: "Crowdin Site",
            source: "external_tms",
            externalProviderKind: "crowdin",
            logoUrl: "https://crowdin.example/site.png",
          }),
        ]}
        projectsQuery={successQuery()}
        isSavingProject={false}
        isDeletingProject={false}
        organizationSlug="acme"
        variant="tms"
      />,
    );

    expect(document.querySelector('img[src="https://crowdin.example/site.png"]')).not.toBeNull();
    expect(screen.getByTitle("Crowdin Site")).toBeInTheDocument();
  });
});
