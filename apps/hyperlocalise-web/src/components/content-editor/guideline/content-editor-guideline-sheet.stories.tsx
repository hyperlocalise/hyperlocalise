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

import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import type { GuidelineDocument } from "@/lib/go-svc/go-svc-guidelines-api";

import { ContentEditorGuidelineSheet } from "./content-editor-guideline-sheet";

const organizationSlug = "acme";
const projectId = "project_1";

function storyDocument(overrides: Partial<GuidelineDocument> = {}): GuidelineDocument {
  return {
    id: "doc-1",
    projectId: null,
    locale: null,
    title: "Voice guide",
    filename: "voice.md",
    contentType: "text/markdown",
    byteSize: 128,
    characterCount: 120,
    truncated: false,
    revisionId: "rev-1",
    version: 1,
    mandatory: false,
    status: "ready",
    errorCode: null,
    indexed: true,
    createdAt: "2026-10-10T00:00:00Z",
    updatedAt: "2026-10-10T00:00:00Z",
    ...overrides,
  };
}

function storyClient(documents: {
  project: GuidelineDocument[];
  workspace: GuidelineDocument[];
}): GoSvcClient {
  return {
    guidelines: {
      listDocuments: async (_org: string, scopeProjectId?: string) =>
        scopeProjectId ? documents.project : documents.workspace,
      getDocument: async (_org: string, id: string) =>
        storyDocument({
          ...(documents.project.find((document) => document.id === id) ??
            documents.workspace.find((document) => document.id === id)),
          content: "# Voice\n\nKeep product names in English.",
        }),
      listAllDocumentAssignments: async () => ({ assignments: [] }),
    },
  } as unknown as GoSvcClient;
}

function GuidelineSheetStory({
  styleGuide,
  projectDocuments = [],
  workspaceDocuments = [],
}: {
  styleGuide: string;
  projectDocuments?: GuidelineDocument[];
  workspaceDocuments?: GuidelineDocument[];
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
          client={storyClient({ project: projectDocuments, workspace: workspaceDocuments })}
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

export const WithDocuments: Story = {
  args: {
    projectDocuments: [
      storyDocument({ id: "doc-1", projectId: "project_1", title: "Voice guide" }),
      storyDocument({ id: "doc-2", projectId: "project_1", title: "Tone guide" }),
    ],
    workspaceDocuments: [storyDocument({ id: "doc-3", title: "Brand rules", locale: "fr-FR" })],
  },
};
