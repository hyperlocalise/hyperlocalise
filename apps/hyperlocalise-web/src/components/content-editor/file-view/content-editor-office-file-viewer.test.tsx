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
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { emptyOfficeSnapshot, loadOfficeSnapshotFromUrl } from "./content-editor-office-convert";
import { ContentEditorOfficeFileViewerPane } from "./content-editor-office-file-viewer";
import {
  mountCatUniverHost,
  type ContentEditorUniverHostHandle,
} from "./content-editor-univer-host";

// These tests cover when the editor mounts, not how a Word file is read.
vi.mock("./content-editor-office-convert", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./content-editor-office-convert")>()),
  loadOfficeSnapshotFromUrl: vi.fn(),
}));

// Univer draws on canvas, which happy-dom does not provide.
vi.mock("./content-editor-univer-host", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./content-editor-univer-host")>()),
  mountCatUniverHost: vi.fn(),
}));

const loadSnapshot = vi.mocked(loadOfficeSnapshotFromUrl);
const mountHost = vi.mocked(mountCatUniverHost);

function createHost(): ContentEditorUniverHostHandle {
  return {
    getSnapshot: vi.fn<ContentEditorUniverHostHandle["getSnapshot"]>(),
    dispose: vi.fn<ContentEditorUniverHostHandle["dispose"]>(),
  };
}

function renderPane(src: string) {
  return (
    <ContentEditorTestProviders>
      <ContentEditorOfficeFileViewerPane
        kind="docx"
        role="target"
        src={src}
        filename="brief.docx"
        onSave={() => undefined}
      />
    </ContentEditorTestProviders>
  );
}

async function waitForEditorReady() {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /save edits/i })).toBeEnabled();
  });
}

beforeEach(() => {
  loadSnapshot.mockImplementation(async ({ kind, filename }) =>
    emptyOfficeSnapshot(kind, filename),
  );
});

afterEach(() => {
  loadSnapshot.mockReset();
  mountHost.mockReset();
});

describe("ContentEditorOfficeFileViewerPane", () => {
  it("mounts the editor once and keeps it across re-renders", async () => {
    const host = createHost();
    mountHost.mockResolvedValue(host);

    const { rerender } = render(renderPane("https://example.com/brief.docx"));
    await waitForEditorReady();

    rerender(renderPane("https://example.com/brief.docx"));
    await waitForEditorReady();

    expect(mountHost).toHaveBeenCalledTimes(1);
    expect(host.dispose).not.toHaveBeenCalled();
  });

  it("disposes the editor when the file changes and when the pane unmounts", async () => {
    const first = createHost();
    const second = createHost();
    mountHost.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    const { rerender, unmount } = render(renderPane("https://example.com/brief.docx"));
    await waitForEditorReady();

    rerender(renderPane("https://example.com/brief-v2.docx"));
    await waitFor(() => {
      expect(mountHost).toHaveBeenCalledTimes(2);
    });
    await waitForEditorReady();

    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).not.toHaveBeenCalled();

    unmount();
    expect(second.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes an editor that finishes mounting after the file changed", async () => {
    const stale = createHost();
    const current = createHost();
    let finishStaleMount: (host: ContentEditorUniverHostHandle) => void = () => undefined;
    mountHost
      .mockImplementationOnce(
        () =>
          new Promise<ContentEditorUniverHostHandle>((resolve) => {
            finishStaleMount = resolve;
          }),
      )
      .mockResolvedValueOnce(current);

    const { rerender } = render(renderPane("https://example.com/brief.docx"));
    await waitFor(() => {
      expect(mountHost).toHaveBeenCalledTimes(1);
    });
    expect(mountHost.mock.calls[0]?.[0].signal?.aborted).toBe(false);

    rerender(renderPane("https://example.com/brief-v2.docx"));
    await waitForEditorReady();
    expect(mountHost.mock.calls[0]?.[0].signal?.aborted).toBe(true);

    finishStaleMount(stale);
    await waitFor(() => {
      expect(stale.dispose).toHaveBeenCalledTimes(1);
    });
    expect(current.dispose).not.toHaveBeenCalled();
  });
});
