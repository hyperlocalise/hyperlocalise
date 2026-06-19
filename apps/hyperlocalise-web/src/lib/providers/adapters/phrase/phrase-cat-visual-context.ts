import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import {
  type CatVisualContext,
  type CatVisualContextMarker,
  type CatVisualContextScreenshot,
} from "@/lib/translation/cat-visual-context";

import { PhraseApiClient, PhraseApiError, type PhraseKeyScreenshot } from "./phrase-api";
import { createPhraseStringsApiClient } from "./phrase-strings-client";

const maxPhraseScreenshotsToScan = 50;
const maxPhraseScreenshotsPerSegment = 8;
const phraseMarkerFetchConcurrency = 5;

export async function loadPhraseCatVisualContext(input: {
  token: string;
  region?: string | null;
  baseUrl?: string | null;
  externalProjectId: string;
  externalStringId: string;
}): Promise<CatVisualContext> {
  const client = createPhraseStringsApiClient({
    token: input.token,
    region: input.region,
    baseUrl: input.baseUrl,
  });

  return loadPhraseCatVisualContextWithClient({
    client,
    externalProjectId: input.externalProjectId,
    externalStringId: input.externalStringId,
  });
}

export async function loadPhraseCatVisualContextWithClient(input: {
  client: PhraseApiClient;
  externalProjectId: string;
  externalStringId: string;
}): Promise<CatVisualContext> {
  const keyScreenshots = await loadPhraseKeyScreenshots(input);
  if (keyScreenshots) {
    const mapped = await mapWithConcurrency(
      keyScreenshots.filter((screenshot) => screenshot.screenshotUrl),
      phraseMarkerFetchConcurrency,
      async (screenshot) => {
        if (screenshot.markers) {
          const keyMarkers = screenshot.markers.filter(
            (marker) => marker.keyId === input.externalStringId,
          );
          if (keyMarkers.length === 0) {
            return null;
          }

          return mapPhraseScreenshot(screenshot, keyMarkers);
        }

        const markers = await input.client.listScreenshotMarkers(
          input.externalProjectId,
          screenshot.id,
        );
        const keyMarkers = markers.filter((marker) => marker.keyId === input.externalStringId);
        if (keyMarkers.length === 0) {
          return null;
        }

        return mapPhraseScreenshot(screenshot, keyMarkers);
      },
    );

    return {
      screenshots: mapped
        .filter((screenshot): screenshot is CatVisualContextScreenshot => screenshot != null)
        .slice(0, maxPhraseScreenshotsPerSegment),
    };
  }

  const screenshots = await input.client.listScreenshots(input.externalProjectId, {
    maxItems: maxPhraseScreenshotsToScan,
  });
  const candidates = screenshots.filter(
    (screenshot) => screenshot.markersCount > 0 && screenshot.screenshotUrl,
  );

  const matched = await mapWithConcurrency(
    candidates,
    phraseMarkerFetchConcurrency,
    async (screenshot) => {
      const markers = await input.client.listScreenshotMarkers(
        input.externalProjectId,
        screenshot.id,
      );
      const keyMarkers = markers.filter((marker) => marker.keyId === input.externalStringId);
      if (keyMarkers.length === 0) {
        return null;
      }

      return mapPhraseScreenshot(screenshot, keyMarkers);
    },
  );

  return {
    screenshots: matched
      .filter((screenshot): screenshot is CatVisualContextScreenshot => screenshot != null)
      .slice(0, maxPhraseScreenshotsPerSegment),
  };
}

async function loadPhraseKeyScreenshots(input: {
  client: PhraseApiClient;
  externalProjectId: string;
  externalStringId: string;
}): Promise<PhraseKeyScreenshot[] | null> {
  try {
    return await input.client.listKeyScreenshots(input.externalProjectId, input.externalStringId);
  } catch (error) {
    if (error instanceof PhraseApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

function mapPhraseScreenshot(
  screenshot:
    | Awaited<ReturnType<PhraseApiClient["listScreenshots"]>>[number]
    | Awaited<ReturnType<PhraseApiClient["listKeyScreenshots"]>>[number],
  markers: Awaited<ReturnType<PhraseApiClient["listScreenshotMarkers"]>>,
): CatVisualContextScreenshot | null {
  const imageUrl = screenshot.screenshotUrl?.trim();
  if (!imageUrl) {
    return null;
  }

  const mappedMarkers = markers
    .map((marker): CatVisualContextMarker | null => {
      if (
        !Number.isFinite(marker.left) ||
        !Number.isFinite(marker.top) ||
        !Number.isFinite(marker.width) ||
        !Number.isFinite(marker.height) ||
        marker.width <= 0 ||
        marker.height <= 0
      ) {
        return null;
      }

      return {
        left: marker.left,
        top: marker.top,
        width: marker.width,
        height: marker.height,
      };
    })
    .filter((marker): marker is CatVisualContextMarker => marker != null);

  return {
    id: screenshot.id,
    name: screenshot.name,
    imageUrl,
    width: null,
    height: null,
    markers: mappedMarkers,
  };
}
