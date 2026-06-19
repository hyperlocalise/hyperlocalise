import { describe, expect, it, vi } from "vite-plus/test";

import type { PhraseApiClient } from "./phrase-api";
import { loadPhraseCatVisualContextWithClient } from "./phrase-cat-visual-context";

describe("loadPhraseCatVisualContextWithClient", () => {
  it("maps Phrase percentage presentation markers directly", async () => {
    const client = {
      listScreenshots: vi.fn(async () => [
        {
          id: "screenshot-1",
          name: "Homepage",
          description: null,
          screenshotUrl: "https://example.com/home.png",
          markersCount: 1,
        },
      ]),
      listScreenshotMarkers: vi.fn(async () => [
        {
          id: "marker-1",
          keyId: "key-1",
          left: 12.5,
          top: 20,
          width: 30,
          height: 15,
        },
      ]),
    } as unknown as PhraseApiClient;

    const visualContext = await loadPhraseCatVisualContextWithClient({
      client,
      externalProjectId: "project-1",
      externalStringId: "key-1",
    });

    expect(visualContext.screenshots).toEqual([
      {
        id: "screenshot-1",
        name: "Homepage",
        imageUrl: "https://example.com/home.png",
        width: null,
        height: null,
        markers: [{ left: 12.5, top: 20, width: 30, height: 15 }],
      },
    ]);
  });
});
