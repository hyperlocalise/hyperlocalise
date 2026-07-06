import { describe, expect, it, vi } from "vite-plus/test";

import { PhraseApiError, type PhraseApiClient } from "./phrase-api";
import { phraseTmsProvider } from "./phrase-provider";

describe("phraseTmsProvider.loadCatVisualContext", () => {
  it("maps Phrase key screenshot markers without scanning project screenshots", async () => {
    const listScreenshots = vi.fn();
    const listScreenshotMarkers = vi.fn();
    const client = {
      listKeyScreenshots: vi.fn(async () => [
        {
          id: "screenshot-1",
          name: "Homepage",
          description: null,
          screenshotUrl: "https://example.com/home.png",
          markersCount: 1,
          markers: [
            {
              id: "marker-1",
              keyId: "key-1",
              left: 12.5,
              top: 20,
              width: 30,
              height: 15,
            },
          ],
        },
      ]),
      listScreenshots,
      listScreenshotMarkers,
    } as unknown as PhraseApiClient;

    const visualContext = await phraseTmsProvider.loadCatVisualContext({
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
    expect(listScreenshots).not.toHaveBeenCalled();
    expect(listScreenshotMarkers).not.toHaveBeenCalled();
  });

  it("filters key screenshot markers to the requested key only", async () => {
    const client = {
      listKeyScreenshots: vi.fn(async () => [
        {
          id: "screenshot-1",
          name: "Homepage",
          description: null,
          screenshotUrl: "https://example.com/home.png",
          markersCount: 2,
          markers: [
            {
              id: "marker-1",
              keyId: "key-1",
              left: 12.5,
              top: 20,
              width: 30,
              height: 15,
            },
            {
              id: "marker-2",
              keyId: "key-2",
              left: 50,
              top: 60,
              width: 10,
              height: 10,
            },
          ],
        },
      ]),
      listScreenshots: vi.fn(),
      listScreenshotMarkers: vi.fn(),
    } as unknown as PhraseApiClient;

    const visualContext = await phraseTmsProvider.loadCatVisualContext({
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

  it("falls back to project screenshots when key screenshots are unavailable", async () => {
    const client = {
      listKeyScreenshots: vi.fn(async () => {
        throw new PhraseApiError("missing route", 404, null);
      }),
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

    const visualContext = await phraseTmsProvider.loadCatVisualContext({
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
