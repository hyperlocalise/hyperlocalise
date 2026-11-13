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

import {
  emptyGuidelineUploadMswHandlers,
  guidelinePageWidthDecorator,
} from "./guideline-story-decorators";
import { GuidelineTextDocumentDialog } from "./guideline-text-document-dialog";
import { KnowledgeUploadSection } from "./knowledge-upload-section";

const organizationSlug = "acme";

function UploadSectionStory({
  initialLocales = [] as string[],
  initialIsGlobal = false,
  initialTextDialogOpen = false,
}: {
  initialLocales?: string[];
  initialIsGlobal?: boolean;
  initialTextDialogOpen?: boolean;
}) {
  const [textDialogOpen, setTextDialogOpen] = useState(initialTextDialogOpen);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  return (
    <>
      <KnowledgeUploadSection
        onStartMarkdownText={() => setTextDialogOpen(true)}
        selectedFile={selectedFile}
        onFilesSelected={(files) => setSelectedFile(files[0] ?? null)}
      />
      <GuidelineTextDocumentDialog
        open={textDialogOpen}
        onOpenChange={setTextDialogOpen}
        organizationSlug={organizationSlug}
        initialLocales={initialLocales}
        initialIsGlobal={initialIsGlobal}
      />
    </>
  );
}

const meta = {
  title: "Guidelines/Upload section",
  component: UploadSectionStory,
  parameters: { layout: "centered" },
  decorators: [guidelinePageWidthDecorator],
} satisfies Meta<typeof UploadSectionStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FileAndWriteGuideline: Story = {
  parameters: {
    msw: { handlers: emptyGuidelineUploadMswHandlers() },
  },
};

export const WriteGuidelineDialogOpen: Story = {
  args: {
    initialLocales: ["fr-FR", "de-DE"],
    initialIsGlobal: true,
    initialTextDialogOpen: true,
  },
  parameters: {
    msw: { handlers: emptyGuidelineUploadMswHandlers() },
  },
};
