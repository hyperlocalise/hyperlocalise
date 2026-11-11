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
import { expect, userEvent } from "storybook/test";

import { buildJobActivity } from "./build-job-activity";
import {
  failedThenRetriedJobEvents,
  inProgressJobEvents,
  JOB_ACTIVITY_FIXTURE_START,
  partialFailureJobEvents,
} from "./job-activity.fixture";
import { JobActivityView } from "./job-activity-view";

const NOW = JOB_ACTIVITY_FIXTURE_START + 5 * 60 * 1000;
const CREATED_AT = new Date(JOB_ACTIVITY_FIXTURE_START - 60 * 1000).toISOString();

const meta = {
  title: "App/Project/Jobs/Detail/Activity",
  component: JobActivityView,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
  args: {
    items: [],
    createdAt: CREATED_AT,
    createdByName: "Minh Cung",
    resolveActorName: (userId) => (userId === "user-1" ? "Minh Cung" : null),
    buildJobHref: (jobId) => `/org/acme/projects/project_website/jobs/${jobId}`,
    loadFailed: false,
    now: NOW,
  },
} satisfies Meta<typeof JobActivityView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Queued: Story = {};

export const Loading: Story = {
  args: { items: null },
};

export const InProgress: Story = {
  args: {
    items: buildJobActivity(inProgressJobEvents, { jobStatus: "running" }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("220 / 340")).toBeVisible();
    await expect(canvas.getByText("80 reused")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: /Show 4 steps/ }));
    await expect(canvas.getByText("Found 340 strings in the file")).toBeVisible();
  },
};

export const PartialFailure: Story = {
  args: {
    items: buildJobActivity(partialFailureJobEvents, { jobStatus: "succeeded" }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Translated 2 of 3 locales.")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Remaining locales continue in a follow-up job" }),
    ).toBeVisible();
  },
};

export const FailedThenRetried: Story = {
  args: {
    items: buildJobActivity(failedThenRetriedJobEvents, { jobStatus: "running" }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("retried the job", { exact: false })).toBeVisible();
    await expect(canvas.getByText("Failed")).toBeVisible();
  },
};

export const LoadFailed: Story = {
  args: { items: null, loadFailed: true },
};
