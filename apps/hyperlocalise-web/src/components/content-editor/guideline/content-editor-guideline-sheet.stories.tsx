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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { knowledgeMemoryPreviewQueryKey } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/knowledge/_components/knowledge-memory-query";

import { ContentEditorGuidelineSheet } from "./content-editor-guideline-sheet";

const organizationSlug = "acme";
const projectId = "project_1";

function GuidelineSheetStory({
  styleGuide,
  projectGuideline = "",
  workspaceGuideline = "",
}: {
  styleGuide: string;
  projectGuideline?: string;
  workspaceGuideline?: string;
}) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, refetchOnMount: false },
      },
    });
    client.setQueryData(["translation-project", organizationSlug, projectId], {
      translationContextValue: styleGuide,
      source: "native",
    });
    client.setQueryData(
      knowledgeMemoryPreviewQueryKey(organizationSlug, projectId),
      projectGuideline,
    );
    client.setQueryData(knowledgeMemoryPreviewQueryKey(organizationSlug), workspaceGuideline);
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>
      <div className="h-dvh bg-muted/30">
        <ContentEditorGuidelineSheet
          organizationSlug={organizationSlug}
          projectId={projectId}
          open
          canWriteProjects
          onOpenChange={() => {}}
        />
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: "CAT/Guideline sheet",
  component: GuidelineSheetStory,
  parameters: { layout: "fullscreen" },
  args: {
    styleGuide: "",
  },
} satisfies Meta<typeof GuidelineSheetStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const WithStyleGuide: Story = {
  args: {
    styleGuide: "Keep product names in English.\n\nUse sentence case for buttons.",
  },
};
