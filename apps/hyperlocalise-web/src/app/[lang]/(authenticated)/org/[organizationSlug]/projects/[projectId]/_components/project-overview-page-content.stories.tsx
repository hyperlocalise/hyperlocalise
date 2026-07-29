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
  projectOverviewFilesFixture,
  projectOverviewFixture,
  projectOverviewJobsFixture,
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
    openJobCount: projectOverviewFixture.openJobCount,
    isOpenJobCountLoading: false,
    isOpenJobCountError: false,
    jobs: projectOverviewJobsFixture,
    isJobsLoading: false,
    isJobsError: false,
    files: projectOverviewFilesFixture,
    isFilesLoading: false,
    isFilesError: false,
  },
} satisfies Meta<typeof ProjectOverviewPageContentView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Website localization" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Create job" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "View strings" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_website/strings",
    );
    await expect(canvas.getByText("A few things need your attention")).toBeInTheDocument();
    await expect(canvas.getByText("Ongoing")).toBeInTheDocument();
    await expect(canvas.getByText("home.json")).toBeInTheDocument();
  },
};

export const CaughtUp: Story = {
  args: {
    project: projectOverviewCaughtUpFixture,
    openJobCount: projectOverviewCaughtUpFixture.openJobCount,
    jobs: [],
    files: [projectOverviewFilesFixture[1]!],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("You’re all caught up")).toBeInTheDocument();
    await expect(canvas.getByText("Browse files")).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    project: null,
    isProjectLoading: true,
    isOpenJobCountLoading: true,
    isJobsLoading: true,
    isFilesLoading: true,
    openJobCount: 0,
    jobs: [],
    files: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Create job" })).toBeNull();
    await expect(canvas.queryByRole("link", { name: "View strings" })).toBeNull();
  },
};

export const EmptyOngoing: Story = {
  args: {
    project: projectOverviewCaughtUpFixture,
    openJobCount: projectOverviewCaughtUpFixture.openJobCount,
    jobs: [],
    files: [projectOverviewFilesFixture[1]!],
  },
};
