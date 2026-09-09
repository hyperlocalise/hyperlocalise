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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  loadOriginalDocumentContext,
  ORIGINAL_DOCUMENT_UNAVAILABLE_CONTEXT,
} from "./content-editor-original-document-context";

describe("loadOriginalDocumentContext", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the unavailable context when no source URL exists", async () => {
    expect(await loadOriginalDocumentContext(null, "en")).toBe(
      ORIGINAL_DOCUMENT_UNAVAILABLE_CONTEXT,
    );
  });

  it("returns the original document when the source URL loads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Hello source", { status: 200 })),
    );

    expect(await loadOriginalDocumentContext("https://example.com/source.md", "en")).toBe(
      "Original document in en (reference only, may be truncated):\nHello source",
    );
  });

  it("falls back when the source URL returns an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("gone", { status: 404 })),
    );

    expect(await loadOriginalDocumentContext("https://example.com/expired.md", "fr")).toBe(
      ORIGINAL_DOCUMENT_UNAVAILABLE_CONTEXT,
    );
  });

  it("falls back when fetching the source URL throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );

    expect(await loadOriginalDocumentContext("https://example.com/source.md", "en")).toBe(
      ORIGINAL_DOCUMENT_UNAVAILABLE_CONTEXT,
    );
  });
});
