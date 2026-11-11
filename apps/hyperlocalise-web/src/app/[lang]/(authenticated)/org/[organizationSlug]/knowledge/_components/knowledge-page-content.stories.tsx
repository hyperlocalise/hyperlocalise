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

import {
  createGuidelineAssignmentMswHandlers,
  createGuidelineDocumentsMswHandlers,
  storyGuidelineDocument,
} from "./guideline-story-fixtures";
import { KnowledgePageContent } from "./knowledge-page-content";

const organizationSlug = "acme";
const projectId = "project_1";

const meta = {
  title: "Guidelines/Project page",
  component: KnowledgePageContent,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-[880px] max-w-[92vw]">
        <Story />
      </div>
    ),
  ],
  args: { organizationSlug, projectId },
} satisfies Meta<typeof KnowledgePageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProjectGuidelinePage: Story = {
  args: { canUpdateKnowledgeMemory: true },
  parameters: {
    msw: {
      handlers: [
        ...createGuidelineDocumentsMswHandlers({
          documents: [
            storyGuidelineDocument({
              id: "doc-mobile",
              title: "Mobile app copy rules",
              filename: "mobile.md",
              mandatory: true,
            }),
            storyGuidelineDocument({
              id: "doc-global",
              title: "House voice (all projects)",
              filename: "voice.md",
              isGlobal: true,
            }),
            storyGuidelineDocument({
              id: "doc-release",
              title: "Release notes",
              filename: "release.md",
              status: "processing",
              indexed: false,
              characterCount: 0,
            }),
          ],
          contents: {
            "doc-mobile": "# Mobile copy\n\nKeep buttons under 24 characters.",
          },
        }),
        ...createGuidelineAssignmentMswHandlers({
          assignedDocuments: [{ documentId: "doc-mobile", projectIds: ["project_1"] }],
        }),
      ],
    },
  },
};

export const ProjectReadOnly: Story = {
  args: { canUpdateKnowledgeMemory: false },
  parameters: {
    msw: {
      handlers: [
        ...createGuidelineDocumentsMswHandlers({
          documents: [
            storyGuidelineDocument({
              id: "doc-mobile",
              title: "Mobile app copy rules",
              filename: "mobile.md",
              isGlobal: true,
            }),
          ],
        }),
        ...createGuidelineAssignmentMswHandlers({}),
      ],
    },
  },
};

export const ProjectNoDocuments: Story = {
  args: { canUpdateKnowledgeMemory: true },
  parameters: {
    msw: { handlers: createGuidelineDocumentsMswHandlers({ documents: [] }) },
  },
};
