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

import type { GuidelineDocument } from "@/lib/go-svc/go-svc-guidelines-api";

const { useProjectPageQueryMock, goSvcMocks } = vi.hoisted(() => ({
  useProjectPageQueryMock: vi.fn(),
  goSvcMocks: {
    listDocuments: vi.fn(),
    getDocument: vi.fn(),
    listAllDocumentAssignments: vi.fn(),
  },
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

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    loading: false,
    client: {
      guidelines: {
        listDocuments: goSvcMocks.listDocuments,
        getDocument: goSvcMocks.getDocument,
        listAllDocumentAssignments: goSvcMocks.listAllDocumentAssignments,
      },
    },
  }),
}));

vi.mock("@/components/markdown-editor/markdown-editor", () => ({
  MarkdownPreview: ({ value }: { value: string }) => <div>{value}</div>,
}));

import { ContentEditorGuidelineSheet } from "./content-editor-guideline-sheet";

function guidelineDocument(overrides: Partial<GuidelineDocument> = {}): GuidelineDocument {
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

function renderSheet(
  project: { translationContextValue: string; source: "native" | "external_tms" } | undefined,
  options?: {
    isLoading?: boolean;
    isError?: boolean;
    canWriteProjects?: boolean;
    projectDocuments?: GuidelineDocument[];
    workspaceDocuments?: GuidelineDocument[];
    assignments?: { documentId: string; projectIds: string[] }[];
    documentContent?: string;
  },
) {
  useProjectPageQueryMock.mockReturnValue({
    isLoading: options?.isLoading ?? false,
    isFetching: options?.isLoading ?? false,
    isError: options?.isError ?? false,
    data: project,
  });
  goSvcMocks.listDocuments.mockImplementation(async (_org: string, projectId?: string) =>
    projectId ? (options?.projectDocuments ?? []) : (options?.workspaceDocuments ?? []),
  );
  goSvcMocks.listAllDocumentAssignments.mockResolvedValue({
    assignments: options?.assignments ?? [],
  });
  goSvcMocks.getDocument.mockImplementation(async () =>
    guidelineDocument({ content: options?.documentContent ?? "# Voice" }),
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

  it("lists project documents and previews the selected one", async () => {
    const user = userEvent.setup();
    renderSheet(
      { translationContextValue: "Keep names in English.", source: "native" },
      {
        projectDocuments: [
          guidelineDocument({ id: "doc-1", projectId: "project_1", title: "Voice" }),
          guidelineDocument({ id: "doc-2", projectId: "project_1", title: "Tone" }),
        ],
      },
    );

    await user.click(screen.getByRole("tab", { name: "Project guideline" }));

    expect(await screen.findByRole("button", { name: "Voice" })).toBeTruthy();
    expect(await screen.findByText("# Voice")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open project guideline" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_1/knowledge",
    );
    expect(screen.queryByRole("link", { name: "Edit in settings" })).toBeNull();
  });

  it("filters workspace documents by project assignment", async () => {
    const user = userEvent.setup();
    renderSheet(
      { translationContextValue: "", source: "native" },
      {
        workspaceDocuments: [
          guidelineDocument({ id: "doc-all", title: "For everyone" }),
          guidelineDocument({ id: "doc-selected", title: "Selected for us" }),
          guidelineDocument({ id: "doc-other", title: "Other project only" }),
        ],
        assignments: [
          { documentId: "doc-selected", projectIds: ["project_1"] },
          { documentId: "doc-other", projectIds: ["project_9"] },
        ],
      },
    );

    await user.click(screen.getByRole("tab", { name: "Workspace guideline" }));

    expect(await screen.findByRole("button", { name: "For everyone" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Selected for us" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Other project only" })).toBeNull();
  });

  it("shows an empty state when there are no project documents", async () => {
    const user = userEvent.setup();
    renderSheet({ translationContextValue: "", source: "native" });

    await user.click(screen.getByRole("tab", { name: "Project guideline" }));

    expect(await screen.findByText("No project guideline yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open project guideline" })).toBeTruthy();
  });

  it("hides the style guide action when the viewer cannot edit it", () => {
    renderSheet({ translationContextValue: "", source: "external_tms" });

    expect(screen.getByText("No style guide yet. Add one in project settings.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Edit in settings" })).toBeNull();
  });
});
