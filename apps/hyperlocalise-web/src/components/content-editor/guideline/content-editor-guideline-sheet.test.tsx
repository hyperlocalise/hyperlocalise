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
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { useProjectPageQueryMock, getKnowledgeMemoryMock } = vi.hoisted(() => ({
  useProjectPageQueryMock: vi.fn(),
  getKnowledgeMemoryMock: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
  }: {
    href: string;
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

vi.mock(
  "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/_components/project-page-shell",
  () => ({
    useProjectPageQuery: (...args: unknown[]) => useProjectPageQueryMock(...args),
  }),
);

vi.mock(
  "@/app/[lang]/(authenticated)/org/[organizationSlug]/knowledge/_components/knowledge-memory-api",
  () => ({
    getKnowledgeMemory: (...args: unknown[]) => getKnowledgeMemoryMock(...args),
  }),
);

vi.mock("@/components/markdown-editor/markdown-editor", () => ({
  MarkdownPreview: ({ value }: { value: string }) => <div>{value}</div>,
}));

import { ContentEditorGuidelineSheet } from "./content-editor-guideline-sheet";

function renderSheet(
  project: { translationContextValue: string; source: "native" | "external_tms" } | undefined,
  options?: {
    isLoading?: boolean;
    isError?: boolean;
    canWriteProjects?: boolean;
    getKnowledgeMemory?: (input: { projectId?: string }) => Promise<{
      ok: boolean;
      json?: () => Promise<{ knowledgeMemory?: { content: string } }>;
    }>;
  },
) {
  useProjectPageQueryMock.mockReturnValue({
    isLoading: options?.isLoading ?? false,
    isFetching: options?.isLoading ?? false,
    isError: options?.isError ?? false,
    data: project,
  });
  getKnowledgeMemoryMock.mockImplementation(
    options?.getKnowledgeMemory ??
      (async () => ({
        ok: true,
        json: async () => ({ knowledgeMemory: { content: "" } }),
      })),
  );

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <IntlProvider locale="en" messages={{}}>
          {children}
        </IntlProvider>
      </QueryClientProvider>
    );
  }

  return render(
    <ContentEditorGuidelineSheet
      organizationSlug="acme"
      projectId="project_1"
      open
      onOpenChange={vi.fn()}
      canWriteProjects={options?.canWriteProjects ?? true}
    />,
    { wrapper: Wrapper },
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ContentEditorGuidelineSheet", () => {
  it("shows the style guide empty state and only that tab's action", () => {
    renderSheet({ translationContextValue: "", source: "native" });

    expect(screen.getByRole("dialog", { name: "Guideline" })).toBeTruthy();
    expect(screen.getByRole("tabpanel")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Workspace guideline" })).toBeTruthy();
    expect(screen.getByText("No style guide yet. Add one in project settings.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit in settings" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_1/settings",
    );
    expect(screen.queryByRole("link", { name: "Open project guideline" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open workspace guideline" })).toBeNull();
  });

  it("switches the document action to the selected guideline", async () => {
    const user = userEvent.setup();
    renderSheet({ translationContextValue: "Keep names in English.", source: "native" });

    expect(screen.getByText("Keep names in English.")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Project guideline" }));

    expect(await screen.findByText("No project guideline yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open project guideline" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_1/knowledge",
    );
    expect(screen.queryByRole("link", { name: "Edit in settings" })).toBeNull();
  });

  it("hides the style guide action when the viewer cannot edit it", () => {
    renderSheet({ translationContextValue: "", source: "external_tms" });

    expect(screen.getByText("No style guide yet. Add one in project settings.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Edit in settings" })).toBeNull();
  });

  it("keeps the selected tab action when the guideline fails to load", async () => {
    const user = userEvent.setup();
    renderSheet(
      { translationContextValue: "Keep names in English.", source: "native" },
      {
        getKnowledgeMemory: async ({ projectId }) => {
          if (projectId) {
            return { ok: false };
          }
          return { ok: true, json: async () => ({ knowledgeMemory: { content: "" } }) };
        },
      },
    );

    await user.click(screen.getByRole("tab", { name: "Project guideline" }));

    expect(await screen.findByText("Unable to load this guideline.")).toBeTruthy();
    expect(screen.getByRole("tabpanel")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open project guideline" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_1/knowledge",
    );
  });
});
