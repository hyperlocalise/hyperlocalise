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
  listDocuments: vi.fn(),
  uploadDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    loading: false,
    client: {
      guidelines: {
        listDocuments: mocks.listDocuments,
        uploadDocument: mocks.uploadDocument,
        updateDocument: mocks.updateDocument,
        deleteDocument: mocks.deleteDocument,
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
  return {
    id: "doc-1",
    projectId: null,
    locale: "fr-FR",
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
    ...overrides,
  };
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

describe("guidelineDocumentsRefetchInterval", () => {
  it("polls while processing or awaiting enqueue recovery", () => {
    expect(guidelineDocumentsRefetchInterval(undefined)).toBe(false);
    expect(guidelineDocumentsRefetchInterval([guidelineDocument()])).toBe(false);
    expect(guidelineDocumentsRefetchInterval([guidelineDocument({ status: "processing" })])).toBe(
      3000,
    );
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
      guidelineDocument(),
      guidelineDocument({
        id: "doc-2",
        title: "Scanned glossary",
        locale: null,
        status: "failed",
        errorCode: "no_text",
      }),
    ]);

    render(<GuidelineDocumentsSection organizationSlug="acme" projectId="project_1" canUpdate />, {
      wrapper,
    });

    expect(await screen.findByText("French style guide")).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByText("fr-FR")).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("All locales")).toBeTruthy();
    expect(screen.getByText("No readable text was found in this file.")).toBeTruthy();
    expect(mocks.listDocuments).toHaveBeenCalledWith("acme", "project_1", expect.anything());
  });

  it("renders nothing when there are no documents", async () => {
    mocks.listDocuments.mockResolvedValue([]);
    const { container } = render(<GuidelineDocumentsSection organizationSlug="acme" canUpdate />, {
      wrapper,
    });

    await waitFor(() => expect(mocks.listDocuments).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent).toBe(""));
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
    expect(mocks.uploadDocument).toHaveBeenCalledWith(
      "acme",
      { file, filename: "style.md" },
      "project_1",
    );

    await user.click(screen.getByRole("button", { name: "upload" }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Unable to upload style.md.", {
        description: "Unsupported guideline format",
      }),
    );
  });
});
