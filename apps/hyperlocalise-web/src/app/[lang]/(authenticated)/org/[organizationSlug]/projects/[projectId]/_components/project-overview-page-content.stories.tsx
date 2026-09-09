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
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import {
  projectOverviewCaughtUpFixture,
  projectOverviewFixture,
  projectOverviewJobsFixture,
  projectOverviewLocaleProgressFixture,
  projectOverviewMissingGuidanceFixture,
  projectOverviewTmsFixture,
} from "./project-overview.fixture";
import { ProjectOverviewPageContentView } from "./project-overview-page-content";

const meta = {
  title: "App/Project/Overview/Page",
  component: ProjectOverviewPageContentView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: "acme",
    projectId: "project_website",
    project: projectOverviewFixture,
    isProjectLoading: false,
    isProjectError: false,
    jobs: projectOverviewJobsFixture,
    isJobsLoading: false,
    isJobsError: false,
    locales: projectOverviewLocaleProgressFixture,
    isLocaleProgressLoading: false,
    isLocaleProgressError: false,
  },
} satisfies Meta<typeof ProjectOverviewPageContentView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Website localization" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Projects" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Create job" })).toBeInTheDocument();
    await expect(canvas.getByText("Today")).toBeInTheDocument();
    await expect(canvas.getByText("Running")).toBeInTheDocument();
    await expect(canvas.getByText("Review")).toBeInTheDocument();
    await expect(canvas.getByText("Failed")).toBeInTheDocument();
    await expect(
      canvas.getByText((content) => content.includes("fr-FR") && content.includes("Otto")),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(
        (content) =>
          content.includes("de-DE") && content.includes("es-ES") && content.includes("Mina"),
      ),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Guidance")).toBeInTheDocument();
    await expect(canvas.getByText("Sync")).toBeInTheDocument();
    await expect(canvas.getByText("Languages")).toBeInTheDocument();
    await expect(canvas.getByText("French (France)")).toBeInTheDocument();
    await expect(canvas.getByText("German (Germany)")).toBeInTheDocument();
    await expect(canvas.getByPlaceholderText("Search languages")).toBeInTheDocument();
    await expect(canvas.queryByText("Locale health")).toBeNull();
  },
};

export const CaughtUp: Story = {
  args: {
    project: projectOverviewCaughtUpFixture,
    jobs: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No jobs yet")).toBeInTheDocument();
    await expect(
      canvas.getByText("Create a job to start translating, or open Files to review coverage."),
    ).toBeInTheDocument();
    await expect(canvas.getByText("0")).toBeInTheDocument();
  },
};

export const MissingGuidance: Story = {
  args: {
    project: projectOverviewMissingGuidanceFixture,
    jobs: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Add a style guide")).toBeInTheDocument();
    await expect(canvas.getByText("Add style guide")).toBeInTheDocument();
    await expect(
      canvas.getByText("Add tone and terminology so agents stay consistent."),
    ).toBeInTheDocument();
  },
};

export const TmsProject: Story = {
  args: {
    project: projectOverviewTmsFixture,
    projectId: "ext:crowdin:42",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Open Editor" })).toHaveAttribute(
      "href",
      "/org/acme/projects/ext%3Acrowdin%3A42/strings",
    );
    await expect(canvas.queryByText("Sync")).toBeNull();
    await expect(canvas.queryByText("Guidance")).toBeNull();
    await expect(canvas.getByText("Locales")).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    project: null,
    isProjectLoading: true,
    isJobsLoading: true,
    isLocaleProgressLoading: true,
    jobs: [],
    locales: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Create job" })).toBeNull();
    await expect(canvas.queryByRole("link", { name: "Open Editor" })).toBeNull();
  },
};
