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
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { GuidelineDocument } from "@/lib/go-svc/go-svc-guidelines-api";

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  downloadDocument: vi.fn(),
  updateDocument: vi.fn(),
  attachDocumentProject: vi.fn(),
  detachDocumentProject: vi.fn(),
  listAllDocumentAssignments: vi.fn(),
  listProjects: vi.fn(),
  toastError: vi.fn(),
  saveDownload: vi.fn(),
}));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    loading: false,
    client: {
      guidelines: {
        getDocument: mocks.getDocument,
        downloadDocument: mocks.downloadDocument,
        updateDocument: mocks.updateDocument,
        attachDocumentProject: mocks.attachDocumentProject,
        detachDocumentProject: mocks.detachDocumentProject,
        listAllDocumentAssignments: mocks.listAllDocumentAssignments,
      },
      project: {
        list: mocks.listProjects,
      },
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}));

vi.mock("@/lib/go-svc/save-go-svc-download", () => ({
  saveGoSvcDownload: mocks.saveDownload,
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { GuidelineDocumentDetailContent } = await import("./guideline-document-detail-content");
const { guidelineAssignmentProjectsQueryKey, guidelineDocumentAssignmentsQueryKey } =
  await import("./guideline-document-assignments");

function guidelineDocument(overrides: Partial<GuidelineDocument> = {}): GuidelineDocument {
  const base = {
    id: "doc-brand",
    projectId: null,
    locale: null,
    locales: [],
    isGlobal: false,
    title: "Brand voice",
    filename: "brand.md",
    contentType: "text/markdown",
    byteSize: 64,
    characterCount: 60,
    truncated: false,
    revisionId: "rev-1",
    version: 1,
    mandatory: true,
    status: "ready",
    errorCode: null,
    indexed: true,
    createdAt: "2026-10-10T00:00:00Z",
    updatedAt: "2026-10-10T00:00:00Z",
    content: "# Voice rules\n\nKeep product names in English.",
    ...overrides,
  };
  return base as GuidelineDocument;
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <IntlProvider locale="en">
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </IntlProvider>
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

function defaultMocks() {
  mocks.getDocument.mockResolvedValue(guidelineDocument());
  mocks.listAllDocumentAssignments.mockResolvedValue({
    assignments: [{ documentId: "doc-brand", projectIds: ["project_1"] }],
  });
  mocks.listProjects.mockResolvedValue({
    projects: [
      { id: "project_1", name: "Mobile app" },
      { id: "project_2", name: "Marketing site" },
    ],
  });
}

describe("GuidelineDocumentDetailContent", () => {
  it("renders assignments from the list page cache without throwing", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(
      ["guideline-document", "acme", undefined, "doc-brand"],
      guidelineDocument(),
    );
    queryClient.setQueryData(guidelineDocumentAssignmentsQueryKey("acme"), {
      assignments: [{ documentId: "doc-brand", projectIds: ["project_1"] }],
    });
    queryClient.setQueryData(guidelineAssignmentProjectsQueryKey("acme"), {
      projects: [{ id: "project_1", name: "Mobile app" }],
    });

    render(
      <GuidelineDocumentDetailContent
        organizationSlug="acme"
        documentId="doc-brand"
        canUpdate={false}
      />,
      {
        wrapper: ({ children }) => (
          <IntlProvider locale="en">
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
          </IntlProvider>
        ),
      },
    );

    expect(await screen.findByRole("link", { name: "Mobile app" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_1",
    );
    expect(mocks.listAllDocumentAssignments).not.toHaveBeenCalled();
    expect(mocks.listProjects).not.toHaveBeenCalled();
  });

  it("renders metadata, content, and assignments for an org-wide document", async () => {
    defaultMocks();
    render(
      <GuidelineDocumentDetailContent organizationSlug="acme" documentId="doc-brand" canUpdate />,
      { wrapper },
    );

    expect(await screen.findByRole("heading", { name: "Brand voice" })).toBeTruthy();
    expect(screen.getByText("Keep product names in English.")).toBeTruthy();
    expect(await screen.findByRole("link", { name: "Mobile app" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_1",
    );
    expect(screen.getByRole("link", { name: "Back to Guideline" })).toHaveAttribute(
      "href",
      "/org/acme/knowledge",
    );
    expect(screen.getByRole("switch", { name: "Always apply" })).toBeChecked();
    expect(screen.getByText("All locales")).toBeTruthy();
  });

  it("toggles the mandatory switch", async () => {
    defaultMocks();
    const user = userEvent.setup();
    render(
      <GuidelineDocumentDetailContent organizationSlug="acme" documentId="doc-brand" canUpdate />,
      { wrapper },
    );

    await user.click(await screen.findByRole("switch", { name: "Always apply" }));
    await waitFor(() =>
      expect(mocks.updateDocument).toHaveBeenCalledWith(
        "acme",
        "doc-brand",
        { mandatory: false },
        undefined,
      ),
    );
  });

  it("hides edit and assignment controls when read-only", async () => {
    defaultMocks();
    render(
      <GuidelineDocumentDetailContent
        organizationSlug="acme"
        documentId="doc-brand"
        canUpdate={false}
      />,
      { wrapper },
    );

    expect(await screen.findByRole("heading", { name: "Brand voice" })).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Always apply" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(await screen.findByRole("link", { name: "Mobile app" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_1",
    );
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("hides assignments for project-owned documents", async () => {
    defaultMocks();
    mocks.getDocument.mockResolvedValue(
      guidelineDocument({ id: "doc-mobile", projectId: "project_1", title: "Mobile copy" }),
    );
    render(
      <GuidelineDocumentDetailContent
        organizationSlug="acme"
        projectId="project_1"
        documentId="doc-mobile"
        canUpdate
      />,
      { wrapper },
    );

    expect(await screen.findByRole("heading", { name: "Mobile copy" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Projects" })).toBeNull();
    expect(screen.getByRole("link", { name: "Back to Guideline" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_1/knowledge",
    );
  });

  it("downloads the original file", async () => {
    defaultMocks();
    mocks.downloadDocument.mockResolvedValue({ blob: new Blob(["x"]), filename: "brand.md" });
    const user = userEvent.setup();
    render(
      <GuidelineDocumentDetailContent
        organizationSlug="acme"
        documentId="doc-brand"
        canUpdate={false}
      />,
      { wrapper },
    );

    await user.click(await screen.findByRole("button", { name: "Download" }));
    await waitFor(() =>
      expect(mocks.downloadDocument).toHaveBeenCalledWith("acme", "doc-brand", undefined),
    );
    expect(mocks.saveDownload).toHaveBeenCalledWith(
      { blob: expect.any(Blob), filename: "brand.md" },
      "brand.md",
    );
  });

  it("shows an empty state when text content is blank", async () => {
    defaultMocks();
    mocks.getDocument.mockResolvedValue(guidelineDocument({ content: "   " }));
    render(
      <GuidelineDocumentDetailContent
        organizationSlug="acme"
        documentId="doc-brand"
        canUpdate={false}
      />,
      { wrapper },
    );

    expect(await screen.findByRole("heading", { name: "Content" })).toBeTruthy();
    expect(screen.getByText("No content yet")).toBeTruthy();
    expect(screen.getByText("This guideline has no preview text yet.")).toBeTruthy();
  });

  it("shows a notice for binary documents", async () => {
    defaultMocks();
    mocks.getDocument.mockResolvedValue(
      guidelineDocument({
        id: "doc-legal",
        title: "Legal glossary",
        filename: "legal.pdf",
        contentType: "application/pdf",
        content: undefined,
      }),
    );
    render(
      <GuidelineDocumentDetailContent
        organizationSlug="acme"
        documentId="doc-legal"
        canUpdate={false}
      />,
      { wrapper },
    );

    expect(await screen.findByRole("heading", { name: "Legal glossary" })).toBeTruthy();
    expect(screen.getByText(/Preview is not available/)).toBeTruthy();
  });

  it("retries when loading fails", async () => {
    mocks.getDocument.mockRejectedValueOnce(new Error("boom"));
    mocks.getDocument.mockResolvedValue(guidelineDocument());
    mocks.listAllDocumentAssignments.mockResolvedValue({ assignments: [] });
    mocks.listProjects.mockResolvedValue({ projects: [] });
    const user = userEvent.setup();
    render(
      <GuidelineDocumentDetailContent
        organizationSlug="acme"
        documentId="doc-brand"
        canUpdate={false}
      />,
      { wrapper },
    );

    expect(await screen.findByText("Could not load this guideline document.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Brand voice" })).toBeTruthy();
  });
});
