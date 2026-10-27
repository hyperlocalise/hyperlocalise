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
// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { KnowledgeMemoryRecord } from "@/api/routes/knowledge-memory/knowledge-memory.schema";

const apiMocks = vi.hoisted(() => ({
  getKnowledgeMemory: vi.fn(),
  saveKnowledgeMemory: vi.fn(),
  listRevisions: vi.fn(),
  getRevision: vi.fn(),
  restoreRevision: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          "knowledge-memory": {
            $get: apiMocks.getKnowledgeMemory,
            $put: apiMocks.saveKnowledgeMemory,
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

// Only the React build that Next bundles has this; the one the tests run on does not.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  addTransitionType: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/test-org/knowledge",
  useRouter: () => ({ push: apiMocks.routerPush, replace: apiMocks.routerReplace }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: apiMocks.toastError,
    success: apiMocks.toastSuccess,
  },
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
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

vi.mock("@/components/markdown-editor/markdown-editor", () => ({
  MarkdownEditor: ({
    value,
    onChange,
    disabled,
    ariaLabel,
  }: {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    ariaLabel?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      disabled={disabled}
      onInput={(event) => onChange(event.currentTarget.value)}
      onChange={(event) => onChange(event.currentTarget.value)}
      value={value}
    />
  ),
}));

import { KnowledgeMemoryEditor } from "./knowledge-memory-editor";

const initialKnowledgeMemory: KnowledgeMemoryRecord = {
  revisionId: "11111111-1111-4111-8111-111111111111",
  version: 1,
  content: "",
  summary: "Initial version",
  updatedAt: "2026-07-20T10:15:00.000Z",
  updatedByUserId: null,
};

const savedKnowledgeMemory: KnowledgeMemoryRecord = {
  revisionId: "22222222-2222-4222-8222-222222222222",
  version: 2,
  content: "Updated guidance",
  summary: "Clarify tone",
  updatedAt: "2026-07-20T10:20:00.000Z",
  updatedByUserId: null,
};

function jsonResponse(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  return new Response(JSON.stringify(value), {
    ...init,
    headers,
  });
}

function mockInitialLoad(etag = '"rev-1"') {
  apiMocks.getKnowledgeMemory.mockResolvedValue(
    jsonResponse({ knowledgeMemory: initialKnowledgeMemory }, { headers: { ETag: etag } }),
  );
}

function renderEditor({ guardsLeaving = false }: { guardsLeaving?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <a href="/org/test-org/glossaries">Glossaries</a>
        <KnowledgeMemoryEditor
          organizationSlug="test-org"
          canUpdateKnowledgeMemory
          guardsLeaving={guardsLeaving}
        />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

async function editAndOpenSaveDialog(content: string, summary: string) {
  const editor = await screen.findByRole("textbox", { name: "Global guidance" });
  await userEvent.type(editor, content);
  await waitFor(() => {
    expect(editor).toHaveValue(content);
  });

  const saveButton = screen.getByRole("button", { name: "Save changes" });
  await waitFor(() => {
    expect(saveButton).toBeEnabled();
  });
  await userEvent.click(saveButton);

  const summaryInput = await screen.findByRole("textbox", { name: "Version note (optional)" });
  await userEvent.type(summaryInput, summary);
}

describe("KnowledgeMemoryEditor", () => {
  beforeEach(() => {
    apiMocks.getKnowledgeMemory.mockReset();
    apiMocks.saveKnowledgeMemory.mockReset();
    apiMocks.listRevisions.mockReset();
    apiMocks.getRevision.mockReset();
    apiMocks.restoreRevision.mockReset();
    apiMocks.toastError.mockReset();
    apiMocks.toastSuccess.mockReset();
    apiMocks.routerPush.mockReset();
    apiMocks.routerReplace.mockReset();
    window.history.replaceState(null, "", "/org/test-org/knowledge");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks before leaving with an unsaved draft, and keeps the draft when told to stay", async () => {
    mockInitialLoad();
    renderEditor({ guardsLeaving: true });
    const editor = await screen.findByRole("textbox", { name: "Global guidance" });

    await userEvent.type(editor, "Draft guidance");
    expect(fireEvent.click(screen.getByRole("link", { name: "Glossaries" }))).toBe(false);
    expect(await screen.findByText("Leave without saving?")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(editor).toHaveValue("Draft guidance");
    expect(apiMocks.routerReplace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("link", { name: "Glossaries" }));
    await userEvent.click(await screen.findByRole("button", { name: "Leave without saving" }));
    expect(apiMocks.routerReplace).toHaveBeenCalledWith("/org/test-org/glossaries", {
      scroll: undefined,
    });
  });

  it("does not interrupt leaving while nothing is typed", async () => {
    mockInitialLoad();
    renderEditor({ guardsLeaving: true });
    await screen.findByRole("textbox", { name: "Global guidance" });

    expect(fireEvent.click(screen.getByRole("link", { name: "Glossaries" }))).toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("stops asking once the draft is saved", async () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    mockInitialLoad('"rev-1"');
    apiMocks.saveKnowledgeMemory.mockResolvedValue(
      jsonResponse({ knowledgeMemory: savedKnowledgeMemory }, { headers: { ETag: '"rev-2"' } }),
    );
    renderEditor({ guardsLeaving: true });

    await editAndOpenSaveDialog("Updated guidance", "Clarify tone");
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));
    await waitFor(() => {
      expect(apiMocks.toastSuccess).toHaveBeenCalledWith("Committed version 2");
    });

    expect(fireEvent.click(screen.getByRole("link", { name: "Glossaries" }))).toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("leaves the asking to the host page when it is not told to guard", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    mockInitialLoad();
    renderEditor();
    const editor = await screen.findByRole("textbox", { name: "Global guidance" });

    await userEvent.type(editor, "Draft guidance");

    expect(fireEvent.click(screen.getByRole("link", { name: "Glossaries" }))).toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(pushState).not.toHaveBeenCalled();
  });

  it("saves edits with the loaded ETag and applies the committed response ETag", async () => {
    mockInitialLoad('"rev-1"');
    apiMocks.saveKnowledgeMemory.mockResolvedValue(
      jsonResponse({ knowledgeMemory: savedKnowledgeMemory }, { headers: { ETag: '"rev-2"' } }),
    );
    renderEditor();

    await editAndOpenSaveDialog("Updated guidance", "  Clarify tone  ");
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));

    await waitFor(() => {
      expect(apiMocks.saveKnowledgeMemory).toHaveBeenCalledWith(
        {
          param: { organizationSlug: "test-org" },
          json: { content: "Updated guidance", summary: "Clarify tone" },
        },
        { headers: { "If-Match": '"rev-1"' } },
      );
      expect(apiMocks.toastSuccess).toHaveBeenCalledWith("Committed version 2");
    });

    expect(screen.getByRole("textbox", { name: "Global guidance" })).toHaveValue(
      "Updated guidance",
    );
    expect(screen.getByText("Version 2")).toBeInTheDocument();
  });

  it("preserves a stale draft and commits the conflict with the latest ETag", async () => {
    const concurrentKnowledgeMemory: KnowledgeMemoryRecord = {
      revisionId: "33333333-3333-4333-8333-333333333333",
      version: 2,
      content: "Concurrent guidance",
      summary: "Concurrent update",
      updatedAt: "2026-07-20T10:25:00.000Z",
      updatedByUserId: null,
    };
    const finalKnowledgeMemory: KnowledgeMemoryRecord = {
      revisionId: "44444444-4444-4444-8444-444444444444",
      version: 3,
      content: "Local draft guidance",
      summary: "Keep local draft",
      updatedAt: "2026-07-20T10:30:00.000Z",
      updatedByUserId: null,
    };

    mockInitialLoad('"rev-1"');
    apiMocks.saveKnowledgeMemory
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: "knowledge_memory_precondition_failed",
            details: { knowledgeMemory: concurrentKnowledgeMemory },
          },
          {
            status: 412,
            headers: { ETag: '"rev-2"' },
          },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({ knowledgeMemory: finalKnowledgeMemory }, { headers: { ETag: '"rev-3"' } }),
      );
    renderEditor();

    await editAndOpenSaveDialog("Local draft guidance", "Keep local draft");
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));

    await waitFor(() => {
      expect(screen.getByText("Your draft is preserved.", { exact: false })).toBeInTheDocument();
    });
    expect(screen.getByTestId("memory-diff")).toHaveTextContent("Concurrent guidance");
    expect(screen.getByTestId("memory-diff")).toHaveTextContent("Local draft guidance");

    await userEvent.click(screen.getByRole("button", { name: "Commit draft as next version" }));

    await waitFor(() => {
      expect(apiMocks.saveKnowledgeMemory).toHaveBeenLastCalledWith(
        {
          param: { organizationSlug: "test-org" },
          json: { content: "Local draft guidance", summary: "Keep local draft" },
        },
        { headers: { "If-Match": '"rev-2"' } },
      );
      expect(apiMocks.toastSuccess).toHaveBeenCalledWith("Committed version 3");
    });
  });
});
