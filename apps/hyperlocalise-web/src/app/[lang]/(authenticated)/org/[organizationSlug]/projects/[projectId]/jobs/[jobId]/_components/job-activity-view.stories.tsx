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

import {
  guidelineContextEvents,
  type GuidelineRetrievalTrace,
} from "@/lib/job-events/guideline-context-events";

import { buildJobActivity } from "./build-job-activity";
import {
  failedThenRetriedJobEvents,
  inProgressJobEvents,
  jobEventsFixture,
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

const includedGuidelineTrace: GuidelineRetrievalTrace = {
  localeCount: 2,
  result: "ok",
  errorCode: null,
  mandatoryIncludedCount: 1,
  mandatoryOmittedCount: 0,
  passageCount: 3,
  passageDocumentCount: 1,
  searchAvailable: true,
  includedTitles: ["Brand guide", "French style"],
};

function finishedGuidelineRun(trace: GuidelineRetrievalTrace | null, enabled: boolean) {
  return buildJobActivity(
    jobEventsFixture([
      { type: "job_started", payload: { targetLocales: ["en-AU", "vi-VN"] } },
      { type: "context_ready", payload: { glossaryTermCount: 0 } },
      ...guidelineContextEvents({ enabled, trace }),
      { type: "strings_extracted", payload: { stringCount: 3, localeCount: 2 } },
      { type: "locale_completed", locale: "en-AU", payload: { fileId: "file-en" } },
      { type: "locale_completed", locale: "vi-VN", payload: { fileId: "file-vi" } },
      {
        type: "job_succeeded",
        payload: { completedLocales: ["en-AU", "vi-VN"], failedLocales: [], followUpJobId: null },
      },
    ]),
    { jobStatus: "succeeded" },
  );
}

async function expectGuidelineSteps(
  canvas: {
    getByRole: (role: string, options: { name: RegExp }) => HTMLElement;
    getByText: (text: string) => HTMLElement;
  },
  lines: string[],
) {
  await userEvent.click(canvas.getByRole("button", { name: /Show 11 steps/ }));
  await expect(canvas.getByText("Loaded no glossary terms")).toBeVisible();
  for (const line of lines) {
    await expect(canvas.getByText(line)).toBeVisible();
  }
}

export const GuidelinesIncluded: Story = {
  args: {
    items: finishedGuidelineRun(includedGuidelineTrace, true),
  },
  play: async ({ canvas }) => {
    await expectGuidelineSteps(canvas, [
      "Guidelines are turned on for this workspace.",
      "Requested guidelines for 2 locales.",
      "Included Brand guide and French style.",
      "Included 1 always-applied guideline. 0 did not fit.",
      "Included 3 search passages. They come from 1 guideline.",
    ]);
  },
};

export const GuidelinesOff: Story = {
  args: {
    items: finishedGuidelineRun(null, false),
  },
  play: async ({ canvas }) => {
    await expectGuidelineSteps(canvas, [
      "Guidelines are turned off for this workspace.",
      "Skipped requesting guidelines.",
      "Skipped guideline retrieval.",
      "Skipped always-applied guidelines.",
      "Skipped guideline search passages.",
    ]);
  },
};

export const GuidelinesTimedOut: Story = {
  args: {
    items: finishedGuidelineRun(
      { ...includedGuidelineTrace, result: "timeout", errorCode: null },
      true,
    ),
  },
  play: async ({ canvas }) => {
    await expectGuidelineSteps(canvas, [
      "Guidelines are turned on for this workspace.",
      "Requested guidelines for 2 locales.",
      "Guideline retrieval timed out.",
      "Skipped always-applied guidelines.",
      "Skipped guideline search passages.",
    ]);
  },
};

export const GuidelinesFailed: Story = {
  args: {
    items: finishedGuidelineRun(
      {
        ...includedGuidelineTrace,
        result: "failed",
        errorCode: "guideline_retrieve_failed",
      },
      true,
    ),
  },
  play: async ({ canvas }) => {
    await expectGuidelineSteps(canvas, [
      "Guideline retrieval failed (guideline_retrieve_failed).",
      "Skipped always-applied guidelines.",
      "Skipped guideline search passages.",
    ]);
  },
};

export const GuidelinesSearchUnavailable: Story = {
  args: {
    items: finishedGuidelineRun(
      {
        ...includedGuidelineTrace,
        mandatoryIncludedCount: 0,
        passageCount: 0,
        passageDocumentCount: 0,
        searchAvailable: false,
        includedTitles: [],
      },
      true,
    ),
  },
  play: async ({ canvas }) => {
    await expectGuidelineSteps(canvas, [
      "Guideline retrieval finished with no guidelines included.",
      "Included no always-applied guidelines. 0 did not fit.",
      "Guideline search was unavailable, so no passages were included.",
    ]);
  },
};

export const LoadFailed: Story = {
  args: { items: null, loadFailed: true },
};
