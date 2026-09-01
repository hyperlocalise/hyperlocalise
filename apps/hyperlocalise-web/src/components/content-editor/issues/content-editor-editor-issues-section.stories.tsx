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
import type { CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import {
  issueSheetEmptyMswHandlers,
  issueSheetMswHandlers,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/issue-sheet/_components/issue-sheet-msw-handlers";
import {
  contentEditorLinkedIssuesOrganizationSlug,
  contentEditorLinkedIssuesProjectId,
  contentEditorLinkedIssuesTranslationKeyId,
} from "@/components/content-editor/issues/content-editor-linked-issues-dialog.fixture";

import { ContentEditorEditorIssuesSection } from "./content-editor-editor-issues-section";

const meta = {
  title: "CAT/Issues Panel",
  component: ContentEditorEditorIssuesSection,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/org/acme/projects/project/issues",
      },
    },
    msw: {
      handlers: issueSheetMswHandlers,
    },
  },
  args: {
    open: true,
    organizationSlug: contentEditorLinkedIssuesOrganizationSlug,
    projectId: contentEditorLinkedIssuesProjectId,
    translationKeyId: contentEditorLinkedIssuesTranslationKeyId,
    targetLocale: "ja-JP",
    canCreate: true,
    stringLink: {
      segmentId: contentEditorLinkedIssuesTranslationKeyId,
      sourcePath: "lang/en-US.json",
      targetLocale: "ja-JP",
      translationKeyId: contentEditorLinkedIssuesTranslationKeyId,
      defaultTitle: "Social:",
    },
  },
  decorators: [
    (Story) => (
      <div
        className="min-h-screen bg-muted/20 text-foreground"
        style={{ "--app-shell-plan-footer-height": "2.5rem" } as CSSProperties}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ContentEditorEditorIssuesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithLinkedIssues: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Board")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /New issue/i })).toBeInTheDocument();
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: issueSheetEmptyMswHandlers,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("No issues for this string")).toBeInTheDocument();
    await expect(
      canvas.getByText("Create an issue to track work on this string."),
    ).toBeInTheDocument();
  },
};

export const UnavailableWithoutKey: Story = {
  args: {
    open: true,
    translationKeyId: null,
    stringLink: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Board is unavailable for this string.")).toBeInTheDocument();
  },
};
