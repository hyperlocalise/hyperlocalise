// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const apiMocks = vi.hoisted(() => ({
  listRevisions: vi.fn(),
  getRevision: vi.fn(),
  restoreRevision: vi.fn(),
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          "knowledge-memory": {
            revisions: {
              $get: apiMocks.listRevisions,
              ":revisionId": {
                $get: apiMocks.getRevision,
                restore: { $post: apiMocks.restoreRevision },
              },
            },
          },
        },
      },
    },
  },
}));

vi.mock("@pierre/diffs/react", () => ({
  MultiFileDiff: ({
    oldFile,
    newFile,
  }: {
    oldFile: { contents: string };
    newFile: { contents: string };
  }) => (
    <div data-testid="memory-diff">
      <span>{oldFile.contents}</span>
      <span>{newFile.contents}</span>
    </div>
  ),
}));

import {
  createKnowledgeMemoryDiffFiles,
  KnowledgeMemoryConflictView,
  KnowledgeMemoryHistoryDialog,
  type KnowledgeMemoryConflict,
} from "./knowledge-memory-history-dialog";

const conflict: KnowledgeMemoryConflict = {
  draftContent: "Draft guidance",
  latestEtag: '"revision-2"',
  latestKnowledgeMemory: {
    revisionId: "7e268056-d04f-4d2e-b6b3-5f11cedf865c",
    version: 2,
    content: "Latest guidance",
    summary: "Updated memory",
    updatedAt: "2026-07-17T01:00:00.000Z",
    updatedByUserId: null,
  },
};

const firstRevision = {
  revisionId: "70eeb794-a9b2-4bea-8a7f-c8fa3700da4d",
  version: 1,
  content: "First guidance",
  summary: "Initial rules",
  createdAt: "2026-07-16T01:00:00.000Z",
  createdByUserId: null,
  createdByName: "Nguyen",
  isCurrent: false,
};

const secondRevision = {
  revisionId: "7e268056-d04f-4d2e-b6b3-5f11cedf865c",
  version: 2,
  content: "Second guidance",
  summary: "Refine rules",
  createdAt: "2026-07-17T01:00:00.000Z",
  createdByUserId: null,
  createdByName: "Nguyen",
  isCurrent: true,
};

function jsonResponse(value: unknown, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json");

  return new Response(JSON.stringify(value), {
    status: 200,
    headers: responseHeaders,
  });
}

describe("KnowledgeMemory history UI", () => {
  beforeEach(() => {
    apiMocks.listRevisions.mockReset();
    apiMocks.getRevision.mockReset();
    apiMocks.restoreRevision.mockReset();
  });

  it("builds a Markdown diff without changing either revision", () => {
    expect(
      createKnowledgeMemoryDiffFiles({
        previousContent: "Before",
        selectedContent: "After",
      }),
    ).toEqual({
      oldFile: { name: "Memory.md", contents: "Before", lang: "markdown" },
      newFile: { name: "Memory.md", contents: "After", lang: "markdown" },
    });
  });

  it("preserves the draft and exposes both conflict resolutions", () => {
    const onCommit = vi.fn();
    const onReload = vi.fn();

    render(
      <KnowledgeMemoryConflictView
        conflict={conflict}
        isCommitting={false}
        onCommit={onCommit}
        onReload={onReload}
      />,
    );

    expect(screen.getByText("Your draft is preserved.", { exact: false })).toBeInTheDocument();
    expect(screen.getByTestId("memory-diff")).toHaveTextContent("Latest guidance");
    expect(screen.getByTestId("memory-diff")).toHaveTextContent("Draft guidance");

    fireEvent.click(screen.getByRole("button", { name: "Reload latest" }));
    fireEvent.click(screen.getByRole("button", { name: "Commit draft as next version" }));

    expect(onReload).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("selects a revision, renders its diff, and restores it with the current ETag", async () => {
    apiMocks.listRevisions.mockResolvedValue(
      jsonResponse({
        knowledgeMemoryRevisions: [secondRevision, firstRevision].map(
          ({ content: _content, ...revision }) => revision,
        ),
        nextCursor: null,
      }),
    );
    apiMocks.getRevision.mockImplementation(({ param }: { param: { revisionId: string } }) =>
      Promise.resolve(
        jsonResponse(
          param.revisionId === firstRevision.revisionId
            ? {
                knowledgeMemoryRevision: firstRevision,
                previousKnowledgeMemoryRevision: null,
              }
            : {
                knowledgeMemoryRevision: secondRevision,
                previousKnowledgeMemoryRevision: firstRevision,
              },
        ),
      ),
    );

    const restoredMemory = {
      revisionId: "8d943c2c-c58d-4426-900f-8877d01545f0",
      version: 3,
      content: firstRevision.content,
      summary: "Restored version 1",
      updatedAt: "2026-07-17T02:00:00.000Z",
      updatedByUserId: null,
    };
    apiMocks.restoreRevision.mockResolvedValue(
      jsonResponse({ knowledgeMemory: restoredMemory }, { ETag: '"revision-3"' }),
    );

    const onRestored = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <KnowledgeMemoryHistoryDialog
          organizationSlug="test-org"
          open
          onOpenChange={vi.fn()}
          canUpdateKnowledgeMemory
          hasUnsavedChanges={false}
          currentEtag='"revision-2"'
          currentRevisionId={secondRevision.revisionId}
          conflict={null}
          isCommittingConflict={false}
          onCommitConflict={vi.fn()}
          onReloadLatest={vi.fn()}
          onPreconditionFailed={vi.fn()}
          onRestored={onRestored}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Version 1/u }));
    await waitFor(() => {
      expect(screen.getByTestId("memory-diff")).toHaveTextContent(firstRevision.content);
    });

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(screen.getByRole("heading", { name: "Restore version 1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore version" }));

    await waitFor(() => {
      expect(apiMocks.restoreRevision).toHaveBeenCalledWith(
        {
          param: {
            organizationSlug: "test-org",
            revisionId: firstRevision.revisionId,
          },
        },
        { headers: { "If-Match": '"revision-2"' } },
      );
      expect(onRestored).toHaveBeenCalledWith(restoredMemory, '"revision-3"');
    });
  });
});
