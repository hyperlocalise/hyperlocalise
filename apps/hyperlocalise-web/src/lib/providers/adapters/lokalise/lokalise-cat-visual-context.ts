import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import {
  pixelRectToPercentMarkers,
  type CatVisualContext,
  type CatVisualContextScreenshot,
} from "@/lib/translation/cat-visual-context";

import { LokaliseApiClient } from "./lokalise-api";

const lokaliseScreenshotDetailConcurrency = 5;

export async function loadLokaliseCatVisualContext(input: {
  client: LokaliseApiClient;
  externalProjectId: string;
  externalStringId: string;
}): Promise<CatVisualContext> {
  const keyId = Number(input.externalStringId);
  if (Number.isNaN(keyId)) {
    return { screenshots: [] };
  }

  const screenshots = await input.client.listScreenshotsForKey(input.externalProjectId, keyId);
  const withImage = screenshots.filter((screenshot) => screenshot.imageUrl.trim().length > 0);

  const enriched = await mapWithConcurrency(
    withImage,
    lokaliseScreenshotDetailConcurrency,
    async (screenshot) => {
      const hasKeyArea = screenshot.keyAreas.some((area) => area.keyId === keyId);
      if (hasKeyArea || screenshot.screenshotId <= 0) {
        return screenshot;
      }

      return input.client.getScreenshot(input.externalProjectId, screenshot.screenshotId);
    },
  );

  return {
    screenshots: enriched.map((screenshot) => mapLokaliseScreenshot(screenshot, keyId)),
  };
}

function mapLokaliseScreenshot(
  screenshot: Awaited<ReturnType<LokaliseApiClient["listScreenshotsForKey"]>>[number],
  keyId: number,
): CatVisualContextScreenshot {
  const markers = screenshot.keyAreas
    .filter((area) => area.keyId === keyId)
    .map((area) =>
      pixelRectToPercentMarkers({
        width: screenshot.width,
        height: screenshot.height,
        left: area.left,
        top: area.top,
        widthPx: area.width,
        heightPx: area.height,
      }),
    )
    .filter((marker): marker is NonNullable<typeof marker> => marker != null);

  return {
    id: String(screenshot.screenshotId),
    name: screenshot.title,
    imageUrl: screenshot.imageUrl,
    width: screenshot.width,
    height: screenshot.height,
    markers,
  };
}
