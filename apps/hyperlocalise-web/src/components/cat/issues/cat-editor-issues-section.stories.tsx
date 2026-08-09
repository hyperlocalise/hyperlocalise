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
import { expect, within } from "storybook/test";

import { issueSheetMswHandlers } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/issue-sheet/_components/issue-sheet-msw-handlers";
import {
  catLinkedIssuesOrganizationSlug,
  catLinkedIssuesProjectId,
  catLinkedIssuesTranslationKeyId,
} from "@/components/cat/issues/cat-linked-issues-dialog.fixture";

import { CatEditorIssuesSection } from "./cat-editor-issues-section";

const meta = {
  title: "CAT/Editor Issues Section",
  component: CatEditorIssuesSection,
  parameters: {
    layout: "padded",
    msw: {
      handlers: issueSheetMswHandlers,
    },
  },
  args: {
    organizationSlug: catLinkedIssuesOrganizationSlug,
    projectId: catLinkedIssuesProjectId,
    translationKeyId: catLinkedIssuesTranslationKeyId,
    targetLocale: "ja-JP",
    canCreate: true,
    stringLink: {
      segmentId: catLinkedIssuesTranslationKeyId,
      sourcePath: "lang/en-US.json",
      targetLocale: "ja-JP",
      translationKeyId: catLinkedIssuesTranslationKeyId,
      defaultTitle: "Social:",
      linkLabel: "Open in CAT",
      linkUrl: "/org/acme/projects/project_website/files/cat?segment=1",
    },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-card px-5 pb-5 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CatEditorIssuesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithLinkedIssues: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Issues")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /New issue/i })).toBeInTheDocument();
  },
};

export const UnavailableWithoutKey: Story = {
  args: {
    translationKeyId: null,
    stringLink: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Issues are unavailable for this string.")).toBeInTheDocument();
  },
};
