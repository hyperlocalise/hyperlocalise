import { describe, expect, it } from "vite-plus/test";

import { loadCrowdinCatVisualContext } from "@/lib/providers/adapters/crowdin/crowdin-cat-visual-context";
import { pixelRectToPercentMarkers } from "@/lib/translation/cat-visual-context";

describe("pixelRectToPercentMarkers", () => {
  it("converts pixel coordinates to percentages", () => {
    expect(
      pixelRectToPercentMarkers({
        width: 400,
        height: 800,
        left: 40,
        top: 80,
        widthPx: 120,
        heightPx: 40,
      }),
    ).toEqual({
      left: 10,
      top: 10,
      width: 30,
      height: 5,
    });
  });

  it("returns null when screenshot dimensions are missing", () => {
    expect(
      pixelRectToPercentMarkers({
        width: null,
        height: 800,
        left: 10,
        top: 10,
        widthPx: 20,
        heightPx: 20,
      }),
    ).toBeNull();
  });
});

describe("loadCrowdinCatVisualContext", () => {
  it("maps tagged screenshots for the selected string", async () => {
    const client = {
      listScreenshots: async () => [
        {
          id: 12,
          webUrl: "https://example.com/screen.jpg",
          name: "Checkout",
          size: { width: 200, height: 400 },
          tags: [
            {
              id: 1,
              screenshotId: 12,
              stringId: 99,
              position: { x: 20, y: 40, width: 50, height: 20 },
            },
            {
              id: 2,
              screenshotId: 12,
              stringId: 100,
              position: { x: 0, y: 0, width: 10, height: 10 },
            },
          ],
        },
      ],
    };

    const visualContext = await loadCrowdinCatVisualContext({
      client: client as never,
      externalProjectId: "7",
      externalStringId: "99",
    });

    expect(visualContext.screenshots).toEqual([
      {
        id: "12",
        name: "Checkout",
        imageUrl: "https://example.com/screen.jpg",
        width: 200,
        height: 400,
        markers: [
          {
            left: 10,
            top: 10,
            width: 25,
            height: 5,
          },
        ],
      },
    ]);
  });
});
