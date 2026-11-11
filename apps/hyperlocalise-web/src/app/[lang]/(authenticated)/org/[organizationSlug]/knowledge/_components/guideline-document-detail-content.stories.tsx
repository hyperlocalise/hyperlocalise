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

import { guidelinePageWidthDecorator } from "./guideline-story-decorators";
import { GuidelineDocumentDetailContent } from "./guideline-document-detail-content";
import {
  createGuidelineAssignmentMswHandlers,
  createGuidelineDocumentsMswHandlers,
  storyGuidelineDocument,
} from "./guideline-story-fixtures";

const organizationSlug = "acme";

const brandDocument = storyGuidelineDocument({
  id: "doc-brand",
  title: "Brand voice",
  filename: "brand-voice.md",
  mandatory: true,
  characterCount: 1204,
});

const brandContent =
  "# Brand voice\n\nKeep product names in English.\n\nUse sentence case for buttons.";

function documentHandlers(documentId: string, content: string, assignedProjectIds?: string[]) {
  return [
    ...createGuidelineDocumentsMswHandlers({
      documents: [storyGuidelineDocument({ id: documentId })],
      contents: { [documentId]: content },
    }),
    ...createGuidelineAssignmentMswHandlers({ assignedProjectIds }),
  ];
}

const meta = {
  title: "Guidelines/Document detail",
  component: GuidelineDocumentDetailContent,
  parameters: { layout: "centered" },
  decorators: [guidelinePageWidthDecorator],
  args: { organizationSlug, canUpdate: true },
} satisfies Meta<typeof GuidelineDocumentDetailContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadyWithAssignments: Story = {
  args: { documentId: "doc-brand" },
  parameters: {
    msw: {
      handlers: [
        ...createGuidelineDocumentsMswHandlers({
          documents: [brandDocument],
          contents: { "doc-brand": brandContent },
        }),
        ...createGuidelineAssignmentMswHandlers({ assignedProjectIds: ["project_1"] }),
      ],
    },
  },
};

export const ReadOnly: Story = {
  args: { organizationSlug, documentId: "doc-brand", canUpdate: false },
  parameters: {
    msw: { handlers: documentHandlers("doc-brand", brandContent, ["project_1", "project_2"]) },
  },
};

export const BinaryDocument: Story = {
  args: { organizationSlug, documentId: "doc-legal", canUpdate: true },
  parameters: {
    msw: {
      handlers: [
        ...createGuidelineDocumentsMswHandlers({
          documents: [
            storyGuidelineDocument({
              id: "doc-legal",
              title: "Legal glossary",
              filename: "legal.pdf",
              contentType: "application/pdf",
            }),
          ],
        }),
        ...createGuidelineAssignmentMswHandlers({ assignedProjectIds: [] }),
      ],
    },
  },
};

export const ProjectDocument: Story = {
  args: { organizationSlug, projectId: "project_1", documentId: "doc-mobile", canUpdate: true },
  parameters: {
    msw: {
      handlers: [
        ...createGuidelineDocumentsMswHandlers({
          documents: [
            storyGuidelineDocument({
              id: "doc-mobile",
              title: "Mobile app copy rules",
              filename: "mobile.md",
            }),
          ],
          contents: { "doc-mobile": "# Mobile copy\n\nKeep buttons under 24 characters." },
        }),
        ...createGuidelineAssignmentMswHandlers({
          assignedDocuments: [{ documentId: "doc-mobile", projectIds: ["project_1"] }],
        }),
      ],
    },
  },
};

export const GlobalDocument: Story = {
  args: { organizationSlug, documentId: "doc-house", canUpdate: true },
  parameters: {
    msw: {
      handlers: [
        ...createGuidelineDocumentsMswHandlers({
          documents: [
            storyGuidelineDocument({
              id: "doc-house",
              title: "House voice (all projects)",
              filename: "voice.md",
              mandatory: true,
              locales: ["fr-FR", "de-DE"],
              isGlobal: true,
              characterCount: 2140,
            }),
          ],
          contents: { "doc-house": "# House voice\n\nKeep product names in English." },
        }),
        ...createGuidelineAssignmentMswHandlers({ assignedDocuments: [] }),
      ],
    },
  },
};

export const LoadError: Story = {
  args: { organizationSlug, documentId: "doc-brand", canUpdate: true },
  parameters: {
    msw: { handlers: createGuidelineDocumentsMswHandlers({ failList: true }) },
  },
};
