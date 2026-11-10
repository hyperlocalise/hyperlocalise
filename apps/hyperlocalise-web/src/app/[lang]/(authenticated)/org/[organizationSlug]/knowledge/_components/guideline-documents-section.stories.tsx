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

import { GuidelineDocumentsSection } from "./guideline-documents-section";
import {
  createGuidelineDocumentsMswHandlers,
  storyGuidelineDocument,
} from "./guideline-story-fixtures";

const organizationSlug = "acme";

function populatedDocuments() {
  return [
    storyGuidelineDocument({
      id: "doc-brand",
      title: "Brand voice",
      filename: "brand-voice.md",
      mandatory: true,
      characterCount: 1204,
    }),
    storyGuidelineDocument({
      id: "doc-tone",
      title: "Tone for French",
      filename: "tone-fr.md",
      locale: "fr-FR",
      characterCount: 860,
    }),
    storyGuidelineDocument({
      id: "doc-long",
      title: "Legal glossary (truncated excerpt)",
      filename: "legal.pdf",
      contentType: "application/pdf",
      characterCount: 48_000,
      truncated: true,
    }),
    storyGuidelineDocument({
      id: "doc-indexing",
      title: "Just uploaded",
      filename: "new.md",
      indexed: false,
    }),
  ];
}

const meta = {
  title: "Guidelines/Documents section",
  component: GuidelineDocumentsSection,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-[720px] max-w-[90vw]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GuidelineDocumentsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  args: { organizationSlug, canUpdate: true },
  parameters: {
    msw: { handlers: createGuidelineDocumentsMswHandlers({ documents: populatedDocuments() }) },
  },
};

export const ReadOnly: Story = {
  args: { organizationSlug, canUpdate: false },
  parameters: {
    msw: { handlers: createGuidelineDocumentsMswHandlers({ documents: populatedDocuments() }) },
  },
};

export const ProjectScoped: Story = {
  args: { organizationSlug, projectId: "project_1", canUpdate: true },
  parameters: {
    msw: {
      handlers: createGuidelineDocumentsMswHandlers({
        documents: [
          storyGuidelineDocument({
            id: "doc-mobile",
            projectId: "project_1",
            title: "Mobile app copy rules",
            filename: "mobile.md",
          }),
        ],
      }),
    },
  },
};

export const Processing: Story = {
  args: { organizationSlug, canUpdate: true },
  parameters: {
    msw: {
      handlers: createGuidelineDocumentsMswHandlers({
        documents: [
          storyGuidelineDocument({
            id: "doc-processing",
            title: "Annual report",
            filename: "annual-report.pdf",
            contentType: "application/pdf",
            status: "processing",
            indexed: false,
            characterCount: 0,
          }),
        ],
      }),
    },
  },
};

export const Failed: Story = {
  args: { organizationSlug, canUpdate: true },
  parameters: {
    msw: {
      handlers: createGuidelineDocumentsMswHandlers({
        documents: [
          storyGuidelineDocument({
            id: "doc-broken",
            title: "Scanned menu",
            filename: "menu.pdf",
            contentType: "application/pdf",
            status: "failed",
            errorCode: "no_text",
            indexed: false,
            characterCount: 0,
          }),
          storyGuidelineDocument({
            id: "doc-retrying",
            title: "Enqueue retry",
            filename: "retry.md",
            status: "failed",
            errorCode: "guideline_ingest_enqueue_failed",
            indexed: false,
            characterCount: 0,
          }),
        ],
      }),
    },
  },
};

export const LoadError: Story = {
  args: { organizationSlug, canUpdate: true },
  parameters: {
    msw: { handlers: createGuidelineDocumentsMswHandlers({ failList: true }) },
  },
};
