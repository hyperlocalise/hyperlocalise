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
import { expect, userEvent, within } from "storybook/test";

import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import type { GuidelineDocument } from "@/lib/go-svc/go-svc-guidelines-api";

import { ContentEditorGuidelineSheet } from "./content-editor-guideline-sheet";

const organizationSlug = "acme";
const projectId = "project_1";

function storyDocument(overrides: Partial<GuidelineDocument> = {}): GuidelineDocument {
  const base = {
    id: "doc-1",
    projectId: null,
    locale: null,
    locales: [],
    isGlobal: false,
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
  return base as GuidelineDocument;
}

function storyClient(documents: {
  workspace: GuidelineDocument[];
  assignments?: { documentId: string; projectIds: string[] }[];
}): GoSvcClient {
  return {
    guidelines: {
      listDocuments: async () => documents.workspace,
      getDocument: async (_org: string, id: string) => {
        const document = documents.workspace.find((item) => item.id === id);
        return storyDocument({
          ...document,
          content: document?.content ?? "",
        });
      },
      listAllDocumentAssignments: async () => ({
        assignments: documents.assignments ?? [],
      }),
    },
  } as unknown as GoSvcClient;
}

function GuidelineSheetStory({
  styleGuide,
  workspaceDocuments = [],
  assignments = [],
}: {
  styleGuide: string;
  workspaceDocuments?: GuidelineDocument[];
  assignments?: { documentId: string; projectIds: string[] }[];
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
          client={storyClient({ workspace: workspaceDocuments, assignments })}
        />
      </div>
    </QueryClientProvider>
  );
}

const STYLE_GUIDE = `Audience: people using the product in Vietnamese.
Tone: clear and direct.

Address the reader as bạn. Do not use khách hàng.
Keep the product name Hyperlocalise unchanged.
Buttons: a short action verb.`;

const VIETNAMESE_VOICE = `# Vietnamese voice

Use this for every English → Vietnamese string.

- Address the reader as **bạn**. Do not use **khách hàng** in product UI.
- Keep the product name **Hyperlocalise** unchanged.
- Buttons: a short action verb.`;

const VIETNAMESE_EXAMPLES = `# Examples

Source: Hyperlocalise can help you review translations.
Use: Hyperlocalise có thể giúp bạn duyệt bản dịch.
Avoid: Hyperlocalise có thể giúp khách hàng duyệt bản dịch.

Source: Welcome to Hyperlocalise.
Use: Chào mừng bạn đến với Hyperlocalise.
Avoid: Chào mừng.`;

const meta = {
  title: "CAT/Guideline sheet",
  component: GuidelineSheetStory,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Guidelines for an English → Vietnamese (en-US to vi) product UI. Address the reader as bạn, and keep the product name Hyperlocalise.",
      },
    },
  },
  args: {
    styleGuide: "",
  },
} satisfies Meta<typeof GuidelineSheetStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  name: "No guideline yet",
  parameters: {
    docs: {
      description: {
        story: "This Vietnamese project has no style guide and no guideline documents yet.",
      },
    },
  },
};

export const WithStyleGuide: Story = {
  name: "Style guide for Vietnamese",
  args: {
    styleGuide: STYLE_GUIDE,
  },
  parameters: {
    docs: {
      description: {
        story:
          "The project style guide for English → Vietnamese: address the reader as bạn, and keep Hyperlocalise in English.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole("tab", { name: "Style guide" }));
    await expect(body.getByText(/Address the reader as bạn/)).toBeInTheDocument();
    await expect(body.getByText(/Keep the product name Hyperlocalise/)).toBeInTheDocument();
  },
};

export const WithDocuments: Story = {
  name: "Vietnamese voice",
  args: {
    styleGuide: STYLE_GUIDE,
    workspaceDocuments: [
      storyDocument({
        id: "doc-voice",
        title: "Vietnamese voice",
        filename: "vietnamese-voice.md",
        isGlobal: true,
        locales: ["vi"],
        mandatory: true,
        content: VIETNAMESE_VOICE,
      }),
      storyDocument({
        id: "doc-examples",
        title: "Vietnamese examples",
        filename: "vietnamese-examples.md",
        isGlobal: true,
        locales: ["vi"],
        content: VIETNAMESE_EXAMPLES,
      }),
      storyDocument({
        id: "doc-market",
        title: "Vietnam market notes",
        filename: "vietnam-market.md",
        locales: ["vi"],
        status: "processing",
      }),
    ],
    assignments: [{ documentId: "doc-market", projectIds: ["project_1"] }],
  },
  parameters: {
    docs: {
      description: {
        story:
          "Vietnamese voice always applies, so the whole document is sent on every vi check. The examples are searched. Market notes are still being read and apply only to this project.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("Always apply")).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Show Vietnamese voice" }));
    await expect(body.getByText(/Do not use/)).toBeInTheDocument();
    await expect(body.getByText("khách hàng", { exact: true })).toBeInTheDocument();
    await expect(
      body.getByRole("button", { name: "Show Vietnamese examples" }),
    ).toBeInTheDocument();
    await expect(body.getByText("Vietnam market notes")).toBeInTheDocument();
  },
};
