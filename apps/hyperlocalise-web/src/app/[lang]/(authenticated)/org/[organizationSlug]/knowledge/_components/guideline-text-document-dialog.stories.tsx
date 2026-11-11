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
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { GuidelineDocument } from "@/lib/go-svc/go-svc-guidelines-api";

import { guidelineDialogWidthDecorator } from "./guideline-story-decorators";
import {
  createGuidelineDocumentsMswHandlers,
  storyGuidelineDocument,
} from "./guideline-story-fixtures";
import { GuidelineTextDocumentDialog } from "./guideline-text-document-dialog";

const organizationSlug = "acme";

const markdownDocument = storyGuidelineDocument({
  id: "doc-brand",
  title: "Brand voice",
  filename: "brand-voice.md",
});

const pdfDocument = storyGuidelineDocument({
  id: "doc-legal",
  title: "Legal glossary",
  filename: "legal.pdf",
  contentType: "application/pdf",
});

const multilingualDocument = storyGuidelineDocument({
  id: "doc-release",
  title: "Release notes",
  filename: "release.md",
  locales: ["fr-FR", "de-DE"],
  isGlobal: true,
});

function OpenDialogStory({
  document,
  initialLocales,
  initialIsGlobal,
}: {
  document?: GuidelineDocument | null;
  initialLocales?: string[];
  initialIsGlobal?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <GuidelineTextDocumentDialog
      open={open}
      onOpenChange={setOpen}
      organizationSlug={organizationSlug}
      document={document}
      initialLocales={initialLocales}
      initialIsGlobal={initialIsGlobal}
    />
  );
}

const meta = {
  title: "Guidelines/Text document dialog",
  component: OpenDialogStory,
  parameters: { layout: "centered" },
  decorators: [guidelineDialogWidthDecorator],
} satisfies Meta<typeof OpenDialogStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {
  parameters: {
    msw: { handlers: createGuidelineDocumentsMswHandlers({ documents: [] }) },
  },
};

export const CreateFromUpload: Story = {
  args: { initialLocales: ["fr-FR", "de-DE"], initialIsGlobal: true },
  parameters: {
    msw: { handlers: createGuidelineDocumentsMswHandlers({ documents: [] }) },
  },
};

export const EditMarkdown: Story = {
  parameters: {
    msw: {
      handlers: createGuidelineDocumentsMswHandlers({
        documents: [markdownDocument],
        contents: { "doc-brand": "# Brand voice\n\nKeep product names in English." },
      }),
    },
  },
  render: () => <OpenDialogStory document={markdownDocument} />,
};

export const EditPdfTitleOnly: Story = {
  parameters: {
    msw: {
      handlers: createGuidelineDocumentsMswHandlers({ documents: [pdfDocument] }),
    },
  },
  render: () => <OpenDialogStory document={pdfDocument} />,
};

export const EditMarkdownLocales: Story = {
  parameters: {
    msw: {
      handlers: createGuidelineDocumentsMswHandlers({
        documents: [multilingualDocument],
        contents: { "doc-release": "# Release notes\n\nKeep product names in English." },
      }),
    },
  },
  render: () => <OpenDialogStory document={multilingualDocument} />,
};
