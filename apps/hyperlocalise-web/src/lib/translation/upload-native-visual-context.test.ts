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
import { describe, expect, it, vi } from "vite-plus/test";

import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";

import {
  isVisualContextScreenshotFile,
  uploadNativeVisualContextScreenshot,
} from "./upload-native-visual-context";

describe("isVisualContextScreenshotFile", () => {
  it("accepts PNG, JPEG, and WebP", () => {
    expect(isVisualContextScreenshotFile(new File(["x"], "a.png", { type: "image/png" }))).toBe(
      true,
    );
    expect(isVisualContextScreenshotFile(new File(["x"], "a.jpg", { type: "image/jpeg" }))).toBe(
      true,
    );
    expect(isVisualContextScreenshotFile(new File(["x"], "a.webp", { type: "image/webp" }))).toBe(
      true,
    );
    expect(isVisualContextScreenshotFile(new File(["x"], "a.gif", { type: "image/gif" }))).toBe(
      false,
    );
  });
});

describe("uploadNativeVisualContextScreenshot", () => {
  it("creates, uploads, finalizes, and reloads visual context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const createVisualContextScreenshot = vi.fn().mockResolvedValue({
      screenshot: { id: "shot-1", status: "upload_pending" },
      upload: {
        url: "https://objects.test/upload/shot.png",
        method: "PUT",
        headers: { "Content-Type": ["image/png"] },
        expiresAt: "2026-01-01T00:00:00Z",
      },
    });
    const finalizeVisualContextScreenshot = vi.fn().mockResolvedValue({
      screenshot: {
        id: "shot-1",
        name: "shot",
        imageUrl: "https://objects.test/download/shot.png",
        width: null,
        height: null,
        markers: [],
      },
    });
    const visualContext = vi.fn().mockResolvedValue({
      visualContext: {
        screenshots: [
          {
            id: "shot-1",
            name: "shot",
            imageUrl: "https://objects.test/download/shot.png",
            width: null,
            height: null,
            markers: [],
          },
        ],
      },
    });
    const client = {
      cat: {
        createVisualContextScreenshot,
        finalizeVisualContextScreenshot,
        visualContext,
      },
    } as unknown as GoSvcClient;
    const file = new File(["png"], "checkout.png", { type: "image/png" });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const result = await uploadNativeVisualContextScreenshot({
        client,
        organizationSlug: "acme",
        projectId: "project-1",
        sourcePath: "locales/en.json",
        externalStringId: "key-1",
        file,
      });

      expect(createVisualContextScreenshot).toHaveBeenCalledWith("acme", "project-1", {
        filename: "checkout.png",
        contentType: "image/png",
        byteSize: file.size,
        name: "checkout",
        sourcePath: "locales/en.json",
        externalStringId: "key-1",
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://objects.test/upload/shot.png",
        expect.objectContaining({ method: "PUT", body: file }),
      );
      expect(finalizeVisualContextScreenshot).toHaveBeenCalledWith(
        "acme",
        "project-1",
        "shot-1",
        {},
      );
      expect(result.screenshots).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
