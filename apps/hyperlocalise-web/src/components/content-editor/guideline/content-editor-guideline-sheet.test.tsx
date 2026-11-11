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

function renderSheet(
  project: { translationContextValue: string; source: "native" | "external_tms" } | undefined,
  options?: {
    isLoading?: boolean;
    isError?: boolean;
    canWriteProjects?: boolean;
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
  goSvcMocks.listDocuments.mockImplementation(async () => options?.workspaceDocuments ?? []);
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
  it("shows the style guide empty state and only that tab's action", async () => {
    const user = userEvent.setup();
    renderSheet({ translationContextValue: "", source: "native" });

    expect(screen.getByRole("dialog", { name: "Guideline" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Guideline" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Project guideline" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Workspace guideline" })).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Style guide" }));

    expect(screen.getByText("No style guide yet. Add one in project settings.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit in settings" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_1/settings",
    );
    expect(screen.getByRole("tab", { name: "Style guide", selected: true })).toBeTruthy();
  });

  it("lists linked guidelines and previews one when expanded", async () => {
    const user = userEvent.setup();
    renderSheet(
      { translationContextValue: "Keep names in English.", source: "native" },
      {
        workspaceDocuments: [
          guidelineDocument({ id: "doc-1", title: "Voice", mandatory: true }),
          guidelineDocument({
            id: "doc-2",
            title: "Tone",
            locales: ["fr-FR"],
            status: "processing",
          }),
        ],
        assignments: [
          { documentId: "doc-1", projectIds: ["project_1"] },
          { documentId: "doc-2", projectIds: ["project_1"] },
        ],
      },
    );

    expect(await screen.findByRole("link", { name: "Voice" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_1/knowledge/doc-1",
    );
    expect(screen.getByRole("link", { name: "Tone" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_1/knowledge/doc-2",
    );
    expect(screen.getAllByText("All locales").length).toBeGreaterThan(0);
    expect(screen.getByText("fr-FR")).toBeTruthy();
    expect(screen.getByText("Always apply")).toBeTruthy();
    expect(screen.getByText("Processing")).toBeTruthy();
    expect(screen.queryByText("# Voice")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show Voice" }));

    expect(await screen.findByText("# Voice")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open knowledge" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_1/knowledge",
    );
    expect(screen.queryByRole("link", { name: "Edit in settings" })).toBeNull();
  });

  it("opens the only guideline without an extra click", async () => {
    renderSheet(
      { translationContextValue: "", source: "native" },
      {
        workspaceDocuments: [guidelineDocument({ id: "doc-1", title: "Voice", isGlobal: true })],
      },
    );

    expect(await screen.findByText("# Voice")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide Voice" })).toBeTruthy();
  });

  it("shows global and assigned guidelines for the project", async () => {
    renderSheet(
      { translationContextValue: "", source: "native" },
      {
        workspaceDocuments: [
          guidelineDocument({ id: "doc-unassigned", title: "Not assigned", isGlobal: true }),
          guidelineDocument({ id: "doc-selected", title: "Selected for us" }),
          guidelineDocument({ id: "doc-selected-2", title: "Also selected" }),
          guidelineDocument({ id: "doc-other", title: "Other project only" }),
        ],
        assignments: [
          { documentId: "doc-selected", projectIds: ["project_1"] },
          { documentId: "doc-selected-2", projectIds: ["project_1"] },
          { documentId: "doc-other", projectIds: ["project_9"] },
        ],
      },
    );

    expect(await screen.findByRole("link", { name: "Not assigned" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Selected for us" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Also selected" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Other project only" })).toBeNull();
  });

  it("shows an empty state when there are no guidelines", async () => {
    renderSheet({ translationContextValue: "", source: "native" });

    expect(await screen.findByText("No guideline for this project yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open knowledge" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_1/knowledge",
    );
  });

  it("hides the style guide action when the viewer cannot edit it", async () => {
    const user = userEvent.setup();
    renderSheet({ translationContextValue: "", source: "external_tms" });

    await user.click(screen.getByRole("tab", { name: "Style guide" }));

    expect(screen.getByText("No style guide yet. Add one in project settings.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Edit in settings" })).toBeNull();
  });
});
