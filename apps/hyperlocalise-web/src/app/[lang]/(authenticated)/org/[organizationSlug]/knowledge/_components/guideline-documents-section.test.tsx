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
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { GuidelineDocument } from "@/lib/go-svc/go-svc-guidelines-api";

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
  listAllDocumentAssignments: vi.fn(),
  listProjects: vi.fn(),
  uploadDocument: vi.fn(),
  replaceDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
  attachDocumentProject: vi.fn(),
  detachDocumentProject: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    loading: false,
    client: {
      guidelines: {
        listDocuments: mocks.listDocuments,
        getDocument: mocks.getDocument,
        listAllDocumentAssignments: mocks.listAllDocumentAssignments,
        uploadDocument: mocks.uploadDocument,
        replaceDocument: mocks.replaceDocument,
        updateDocument: mocks.updateDocument,
        deleteDocument: mocks.deleteDocument,
        attachDocumentProject: mocks.attachDocumentProject,
        detachDocumentProject: mocks.detachDocumentProject,
      },
      project: {
        list: mocks.listProjects,
      },
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

const { GuidelineDocumentsSection, guidelineDocumentsRefetchInterval, useGuidelineDocumentUpload } =
  await import("./guideline-documents-section");

function guidelineDocument(overrides: Partial<GuidelineDocument> = {}): GuidelineDocument {
  const base = {
    id: "doc-1",
    projectId: null,
    locale: "fr-FR",
    locales: ["fr-FR"],
    isGlobal: true,
    title: "French style guide",
    filename: "style.pdf",
    contentType: "application/pdf",
    byteSize: 1024,
    characterCount: 1200,
    truncated: false,
    revisionId: "rev-1",
    version: 1,
    mandatory: false,
    status: "ready",
    errorCode: null,
    indexed: true,
    createdAt: "2026-10-10T00:00:00Z",
    updatedAt: "2026-10-10T00:00:00Z",
  };
  const merged = { ...base, ...overrides };
  if (!("locales" in overrides) && "locale" in overrides) {
    merged.locales = overrides.locale ? [overrides.locale] : [];
  }
  return merged as GuidelineDocument;
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listAllDocumentAssignments.mockResolvedValue({ assignments: [] });
  mocks.listProjects.mockResolvedValue({
    projects: [{ id: "project_1", name: "Mobile app" }],
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("guidelineDocumentsRefetchInterval", () => {
  it("polls while processing, indexing, or awaiting enqueue recovery", () => {
    expect(guidelineDocumentsRefetchInterval(undefined)).toBe(false);
    expect(guidelineDocumentsRefetchInterval([guidelineDocument()])).toBe(false);
    expect(guidelineDocumentsRefetchInterval([guidelineDocument({ status: "processing" })])).toBe(
      3000,
    );
    expect(
      guidelineDocumentsRefetchInterval([guidelineDocument({ status: "ready", indexed: false })]),
    ).toBe(3000);
    expect(
      guidelineDocumentsRefetchInterval([
        guidelineDocument({
          status: "failed",
          errorCode: "guideline_ingest_enqueue_failed",
        }),
      ]),
    ).toBe(15_000);
    expect(
      guidelineDocumentsRefetchInterval([
        guidelineDocument({ status: "failed", errorCode: "no_text" }),
      ]),
    ).toBe(false);
  });
});

describe("GuidelineDocumentsSection", () => {
  it("lists documents with status, locale and failure reasons", async () => {
    mocks.listDocuments.mockResolvedValue([
      guidelineDocument({ isGlobal: false }),
      guidelineDocument({
        id: "doc-2",
        title: "Scanned glossary",
        locale: null,
        status: "failed",
        errorCode: "no_text",
      }),
      guidelineDocument({
        id: "doc-3",
        title: "Still indexing",
        locale: "ja-JP",
        status: "ready",
        indexed: false,
      }),
    ]);
    mocks.listAllDocumentAssignments.mockResolvedValue({
      assignments: [{ documentId: "doc-1", projectIds: ["project_1"] }],
    });

    render(<GuidelineDocumentsSection organizationSlug="acme" projectId="project_1" canUpdate />, {
      wrapper,
    });

    expect(await screen.findByText("French style guide")).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByText("fr-FR")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Mobile app" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_1",
    );
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("Still indexing")).toBeTruthy();
    expect(screen.getAllByText("Processing")).toHaveLength(1);
    expect(screen.getByText("All locales")).toBeTruthy();
    expect(screen.getByText("No readable text was found in this file.")).toBeTruthy();
    expect(mocks.listDocuments).toHaveBeenCalledWith("acme", "project_1", expect.anything());
    expect(screen.getByRole("link", { name: "French style guide" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_1/knowledge/doc-1",
    );
  });

  it("unassigns a guideline from the project page", async () => {
    const user = userEvent.setup();
    mocks.listDocuments.mockResolvedValue([
      guidelineDocument({ id: "doc-brand", title: "Brand voice", isGlobal: false }),
      guidelineDocument({ id: "doc-global", title: "Global", isGlobal: true }),
    ]);
    mocks.listAllDocumentAssignments.mockResolvedValue({
      assignments: [{ documentId: "doc-brand", projectIds: ["project_1"] }],
    });
    mocks.detachDocumentProject.mockResolvedValue(undefined);

    render(
      <GuidelineDocumentsSection
        organizationSlug="acme"
        projectId="project_1"
        canUpdate={false}
        canAssignGuideline
      />,
      { wrapper },
    );

    expect(await screen.findByText("Brand voice")).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: "Unassign" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Unassign" }));
    await waitFor(() =>
      expect(mocks.detachDocumentProject).toHaveBeenCalledWith("acme", "doc-brand", "project_1"),
    );
  });

  it("shows an assign CTA when the project list is empty but org guidelines exist", async () => {
    mocks.listDocuments.mockImplementation((_org: string, projectId?: string) =>
      Promise.resolve(
        projectId
          ? []
          : [guidelineDocument({ id: "doc-pool", title: "Brand voice", isGlobal: false })],
      ),
    );
    mocks.listAllDocumentAssignments.mockResolvedValue({ assignments: [] });

    render(
      <GuidelineDocumentsSection
        organizationSlug="acme"
        projectId="project_1"
        canUpdate={false}
        canAssignGuideline
      />,
      { wrapper },
    );

    expect(await screen.findByText("No guidelines assigned to this project")).toBeTruthy();
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create Guideline" })).toBeNull();
  });

  it("assigns an org guideline from the project page", async () => {
    const user = userEvent.setup();
    mocks.listDocuments.mockImplementation((_org: string, projectId?: string) =>
      Promise.resolve(
        projectId
          ? []
          : [
              guidelineDocument({ id: "doc-brand", title: "Brand voice", isGlobal: false }),
              guidelineDocument({ id: "doc-global", title: "Global", isGlobal: true }),
            ],
      ),
    );
    mocks.attachDocumentProject.mockResolvedValue({ projects: [] });

    render(
      <GuidelineDocumentsSection
        organizationSlug="acme"
        projectId="project_1"
        canUpdate={false}
        canAssignGuideline
      />,
      { wrapper },
    );

    await user.click(await screen.findByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Brand voice" }));
    await user.click(screen.getByRole("button", { name: "Assign" }));
    await waitFor(() =>
      expect(mocks.attachDocumentProject).toHaveBeenCalledWith("acme", "doc-brand", "project_1"),
    );
  });

  it("shows an empty state with a create action when there are no documents", async () => {
    mocks.listDocuments.mockResolvedValue([]);
    render(
      <GuidelineDocumentsSection
        organizationSlug="acme"
        canUpdate
        createGuidelineHref="/org/acme/knowledge/upload"
      />,
      { wrapper },
    );

    await waitFor(() => expect(mocks.listDocuments).toHaveBeenCalled());
    expect(await screen.findByText("No guidelines yet")).toBeTruthy();
    const create = screen.getByRole("button", { name: "Create Guideline" });
    expect(create).toHaveAttribute("href", "/org/acme/knowledge/upload");
  });

  it("shows each document's linked projects on the org page", async () => {
    mocks.listDocuments.mockResolvedValue([
      guidelineDocument({ id: "doc-global", title: "Global guide" }),
      guidelineDocument({ id: "doc-linked", title: "Linked guide", isGlobal: false }),
      guidelineDocument({ id: "doc-none", title: "Unassigned guide", isGlobal: false }),
    ]);
    mocks.listAllDocumentAssignments.mockResolvedValue({
      assignments: [{ documentId: "doc-linked", projectIds: ["project_1"] }],
    });

    render(<GuidelineDocumentsSection organizationSlug="acme" canUpdate />, { wrapper });

    expect(await screen.findByText("Global guide")).toBeTruthy();
    expect(screen.getByText("All projects")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Mobile app" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_1",
    );
    expect(screen.getByText("No projects")).toBeTruthy();
  });

  it("toggles mandatory and deletes for writers", async () => {
    const user = userEvent.setup();
    mocks.listDocuments.mockResolvedValue([guidelineDocument()]);
    mocks.updateDocument.mockResolvedValue(guidelineDocument({ mandatory: true }));
    mocks.deleteDocument.mockResolvedValue(undefined);

    render(<GuidelineDocumentsSection organizationSlug="acme" canUpdate />, { wrapper });

    await user.click(await screen.findByRole("switch"));
    await waitFor(() =>
      expect(mocks.updateDocument).toHaveBeenCalledWith(
        "acme",
        "doc-1",
        { mandatory: true },
        undefined,
      ),
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      Array.from(dialog.querySelectorAll("button")).find(
        (button) => button.textContent === "Delete",
      )!,
    );
    await waitFor(() =>
      expect(mocks.deleteDocument).toHaveBeenCalledWith("acme", "doc-1", undefined),
    );
  });

  it("hides write controls for readers", async () => {
    mocks.listDocuments.mockResolvedValue([guidelineDocument()]);
    render(<GuidelineDocumentsSection organizationSlug="acme" canUpdate={false} />, { wrapper });

    expect(await screen.findByText("French style guide")).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("saves title and content edits as a new revision for text documents", async () => {
    const user = userEvent.setup();
    mocks.listDocuments.mockResolvedValue([
      guidelineDocument({ contentType: "text/markdown", filename: "voice.md" }),
    ]);
    mocks.getDocument.mockResolvedValue(
      guidelineDocument({ contentType: "text/markdown", content: "# Voice" }),
    );
    mocks.replaceDocument.mockResolvedValue(guidelineDocument({ version: 2 }));

    render(<GuidelineDocumentsSection organizationSlug="acme" canUpdate />, { wrapper });

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const titleInput = await screen.findByLabelText("Title");
    const contentInput = await screen.findByLabelText("Markdown content");
    expect(titleInput).toHaveValue("French style guide");
    expect(contentInput).toHaveValue("# Voice");

    await user.clear(titleInput);
    await user.type(titleInput, "Voice and tone");
    await user.clear(contentInput);
    await user.type(contentInput, "# Voice and tone");
    await user.click(screen.getByRole("button", { name: "Save guideline" }));

    await waitFor(() => expect(mocks.replaceDocument).toHaveBeenCalled());
    const [org, id, upload, projectId] = mocks.replaceDocument.mock.calls[0]!;
    expect(org).toBe("acme");
    expect(id).toBe("doc-1");
    expect(projectId).toBeUndefined();
    expect((upload.file as File).name).toBe("voice-and-tone.md");
    expect(upload.title).toBe("Voice and tone");
    expect(mocks.updateDocument).not.toHaveBeenCalled();
  });

  it("saves title-only edits without replacing the file", async () => {
    const user = userEvent.setup();
    mocks.listDocuments.mockResolvedValue([
      guidelineDocument({ contentType: "text/markdown", filename: "voice.md" }),
    ]);
    mocks.getDocument.mockResolvedValue(
      guidelineDocument({ contentType: "text/markdown", content: "# Voice" }),
    );

    render(<GuidelineDocumentsSection organizationSlug="acme" canUpdate />, { wrapper });

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const titleInput = await screen.findByLabelText("Title");
    await user.clear(titleInput);
    await user.type(titleInput, "Voice");
    await user.click(screen.getByRole("button", { name: "Save guideline" }));

    await waitFor(() =>
      expect(mocks.updateDocument).toHaveBeenCalledWith(
        "acme",
        "doc-1",
        { title: "Voice", locales: ["fr-FR"], isGlobal: true },
        undefined,
      ),
    );
    expect(mocks.replaceDocument).not.toHaveBeenCalled();
  });
});

describe("useGuidelineDocumentUpload", () => {
  function UploadButton({ file }: { file: File }) {
    const upload = useGuidelineDocumentUpload("acme", "project_1");
    return (
      <button type="button" onClick={() => upload.mutate(file)}>
        upload
      </button>
    );
  }

  it("uploads the file and reports failures", async () => {
    const user = userEvent.setup();
    const file = new File(["# Tone"], "style.md", { type: "text/markdown" });
    mocks.uploadDocument.mockResolvedValueOnce(guidelineDocument({ status: "processing" }));
    mocks.uploadDocument.mockRejectedValueOnce(new Error("Unsupported guideline format"));

    render(<UploadButton file={file} />, { wrapper });
    await user.click(screen.getByRole("button", { name: "upload" }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    // projectId is deprecated; uploads always target the org route and use
    // assignments for project scoping.
    expect(mocks.uploadDocument).toHaveBeenCalledWith(
      "acme",
      { file, filename: "style.md" },
      undefined,
    );

    await user.click(screen.getByRole("button", { name: "upload" }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Unable to upload style.md.", {
        description: "Unsupported guideline format",
      }),
    );
  });
});
