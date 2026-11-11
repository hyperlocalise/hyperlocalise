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

import {
  GUIDELINE_TEMPLATE_CONTENT,
  GUIDELINE_TEMPLATE_TITLE,
} from "./guideline-text-document-template";

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
  uploadDocument: vi.fn(),
  replaceDocument: vi.fn(),
  updateDocument: vi.fn(),
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
        uploadDocument: mocks.uploadDocument,
        replaceDocument: mocks.replaceDocument,
        updateDocument: mocks.updateDocument,
      },
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

const { GuidelineTextDocumentDialog } = await import("./guideline-text-document-dialog");

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

describe("GuidelineTextDocumentDialog template", () => {
  it("fills the template content and title when creating", async () => {
    const user = userEvent.setup();
    mocks.uploadDocument.mockResolvedValue(guidelineDocument());

    render(
      <GuidelineTextDocumentDialog
        open
        onOpenChange={() => {}}
        organizationSlug="acme"
        document={null}
      />,
      { wrapper },
    );

    await user.click(await screen.findByRole("button", { name: "Use template" }));

    expect(screen.getByLabelText("Markdown content")).toHaveValue(GUIDELINE_TEMPLATE_CONTENT);
    expect(screen.getByLabelText("Title")).toHaveValue(GUIDELINE_TEMPLATE_TITLE);

    await user.click(screen.getByRole("button", { name: "Save guideline" }));
    await waitFor(() => expect(mocks.uploadDocument).toHaveBeenCalled());
    const upload = mocks.uploadDocument.mock.calls[0]![1] as { file: File; title: string };
    expect(upload.title).toBe(GUIDELINE_TEMPLATE_TITLE);
    expect(await upload.file.text()).toBe(GUIDELINE_TEMPLATE_CONTENT);
  });

  it("keeps a typed title when applying the template", async () => {
    const user = userEvent.setup();

    render(
      <GuidelineTextDocumentDialog
        open
        onOpenChange={() => {}}
        organizationSlug="acme"
        document={null}
      />,
      { wrapper },
    );

    await user.type(screen.getByLabelText("Title"), "Acme voice");
    await user.click(await screen.findByRole("button", { name: "Use template" }));

    expect(screen.getByLabelText("Markdown content")).toHaveValue(GUIDELINE_TEMPLATE_CONTENT);
    expect(screen.getByLabelText("Title")).toHaveValue("Acme voice");
    expect(mocks.uploadDocument).not.toHaveBeenCalled();
  });

  it("hides the template action when editing", async () => {
    mocks.getDocument.mockResolvedValue(guidelineDocument({ content: "# Voice" }));

    render(
      <GuidelineTextDocumentDialog
        open
        onOpenChange={() => {}}
        organizationSlug="acme"
        document={guidelineDocument()}
      />,
      { wrapper },
    );

    expect(await screen.findByLabelText("Title")).toHaveValue("Voice guide");
    expect(screen.queryByRole("button", { name: "Use template" })).toBeNull();
  });
});
