import { describe, expect, it } from "vite-plus/test";

import { readImageDimensions, smartlingTmsProvider } from "./smartling-provider";

function pngBytes(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe("smartling-cat-visual-context", () => {
  it("reads PNG dimensions from image bytes", () => {
    expect(readImageDimensions(pngBytes(640, 480))).toEqual({ width: 640, height: 480 });
  });

  it("maps image context bindings into CAT screenshots", async () => {
    const imageBytes = pngBytes(400, 800);
    const client = {
      listContextBindings: async () => ({
        items: [
          {
            contextUid: "ctx-1",
            stringHashcode: "hash-1",
            coordinates: { left: 40, top: 80, width: 120, height: 40 },
          },
        ],
        offset: null,
      }),
      getContextInfo: async () => ({
        contextUid: "ctx-1",
        contextType: "IMAGE",
        name: "Checkout screen",
        created: "2026-01-01T00:00:00Z",
      }),
      downloadContextContent: async () => ({
        bytes: imageBytes,
        contentType: "image/png",
      }),
    };

    const visualContext = await smartlingTmsProvider.loadCatVisualContext({
      client: client as never,
      externalProjectId: "project-1",
      externalStringId: "hash-1",
    });

    expect(visualContext.screenshots).toEqual([
      {
        id: "ctx-1",
        name: "Checkout screen",
        imageUrl: expect.stringMatching(/^data:image\/png;base64,/),
        width: 400,
        height: 800,
        markers: [
          {
            left: 10,
            top: 10,
            width: 30,
            height: 5,
          },
        ],
      },
    ]);
  });

  it("skips non-image contexts", async () => {
    const client = {
      listContextBindings: async () => ({
        items: [{ contextUid: "ctx-html", stringHashcode: "hash-1" }],
        offset: null,
      }),
      getContextInfo: async () => ({
        contextUid: "ctx-html",
        contextType: "HTML",
        name: "https://example.com/page",
        created: null,
      }),
      downloadContextContent: async () => {
        throw new Error("should not download HTML context");
      },
    };

    await expect(
      smartlingTmsProvider.loadCatVisualContext({
        client: client as never,
        externalProjectId: "project-1",
        externalStringId: "hash-1",
      }),
    ).resolves.toEqual({ screenshots: [] });
  });
});
