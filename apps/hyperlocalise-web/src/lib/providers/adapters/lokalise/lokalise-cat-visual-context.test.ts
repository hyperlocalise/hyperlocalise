import { describe, expect, it, vi } from "vite-plus/test";

import { type LokaliseApiClient } from "./lokalise-api";
import { loadLokaliseCatVisualContext } from "./lokalise-cat-visual-context";

describe("loadLokaliseCatVisualContext", () => {
  it("fetches screenshot details when the list response omits key coordinates", async () => {
    const client = {
      listScreenshotsForKey: vi.fn(async () => [
        {
          screenshotId: 123,
          title: "Homepage",
          description: null,
          imageUrl: "https://example.com/screenshot.png",
          width: 800,
          height: 600,
          keyIds: [4242],
          keyAreas: [],
        },
      ]),
      getScreenshot: vi.fn(async () => ({
        screenshotId: 123,
        title: "Homepage",
        description: null,
        imageUrl: "https://example.com/screenshot.png",
        width: 800,
        height: 600,
        keyIds: [4242],
        keyAreas: [
          {
            keyId: 4242,
            left: 40,
            top: 80,
            width: 120,
            height: 24,
          },
        ],
      })),
    } as unknown as LokaliseApiClient;

    const visualContext = await loadLokaliseCatVisualContext({
      client,
      externalProjectId: "proj.123",
      externalStringId: "4242",
    });

    expect(client.getScreenshot).toHaveBeenCalledWith("proj.123", 123);
    expect(visualContext.screenshots).toEqual([
      {
        id: "123",
        name: "Homepage",
        imageUrl: "https://example.com/screenshot.png",
        width: 800,
        height: 600,
        markers: [{ left: 5, top: 13.333333333333334, width: 15, height: 4 }],
      },
    ]);
  });
});
