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

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vite-plus/test";

import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";

const { getDocumentProxyMock } = vi.hoisted(() => ({
  getDocumentProxyMock: vi.fn(),
}));

vi.mock("unpdf", () => ({
  getDocumentProxy: getDocumentProxyMock,
}));

import { ContentEditorPdfFileViewerPane } from "./content-editor-pdf-file-viewer";

const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

const destroyLoadingTaskMock = vi.fn(async () => {});

function mockPdfDocument() {
  return {
    loadingTask: { destroy: destroyLoadingTaskMock },
    numPages: 1,
    getPage: vi.fn(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 100 * scale,
        height: 120 * scale,
      }),
      render: vi.fn(() => ({ promise: Promise.resolve() })),
    })),
  };
}

describe("ContentEditorPdfFileViewerPane", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    getDocumentProxyMock.mockResolvedValue(mockPdfDocument());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the target PDF and shows overflow count", async () => {
    fetchMock.mockResolvedValue(
      new Response(pdfBytes, {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "x-hyperlocalise-overflow-keys": "page-1#1,page-1#2",
        },
      }),
    );

    render(
      <ContentEditorTestProviders>
        <ContentEditorPdfFileViewerPane role="target" src="/target.pdf" />
      </ContentEditorTestProviders>,
    );

    await waitFor(() => {
      expect(destroyLoadingTaskMock).toHaveBeenCalled();
    });
    expect(screen.getByText(/2 blocks were shrunk/i)).toBeTruthy();
    expect(screen.queryByText(/destroy is not a function/i)).toBeNull();
  });

  it("falls back to the source PDF when the target is missing", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/target.pdf") {
        return new Response(null, { status: 404 });
      }
      return new Response(pdfBytes, {
        status: 200,
        headers: { "content-type": "application/pdf" },
      });
    });

    render(
      <ContentEditorTestProviders>
        <ContentEditorPdfFileViewerPane role="target" src="/target.pdf" seedSrc="/source.pdf" />
      </ContentEditorTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByText(/No translated PDF yet/i)).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith("/source.pdf", { credentials: "include" });
  });

  it("shows the error when the PDF request fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    render(
      <ContentEditorTestProviders>
        <ContentEditorPdfFileViewerPane role="target" src="/target.pdf" />
      </ContentEditorTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByText("Failed to fetch")).toBeTruthy();
    });
  });

  it("shows script unsupported errors from the download route", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: "pdf_script_unsupported", message: "Arabic script is not supported." },
        { status: 422, headers: { "content-type": "application/json" } },
      ),
    );

    render(
      <ContentEditorTestProviders>
        <ContentEditorPdfFileViewerPane role="target" src="/target.pdf" />
      </ContentEditorTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByText("Arabic script is not supported.")).toBeTruthy();
    });
  });
});
