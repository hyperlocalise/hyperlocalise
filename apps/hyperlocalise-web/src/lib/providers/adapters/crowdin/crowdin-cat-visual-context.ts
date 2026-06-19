import {
  pixelRectToPercentMarkers,
  type CatVisualContext,
  type CatVisualContextScreenshot,
} from "@/lib/translation/cat-visual-context";

import { CrowdinApiClient } from "./crowdin-api";

const maxCrowdinScreenshotsPerSegment = 8;

export async function loadCrowdinCatVisualContext(input: {
  client: CrowdinApiClient;
  externalProjectId: string;
  externalStringId: string;
}): Promise<CatVisualContext> {
  const projectId = Number(input.externalProjectId);
  const stringId = Number(input.externalStringId);
  if (Number.isNaN(projectId) || Number.isNaN(stringId)) {
    return { screenshots: [] };
  }

  const screenshots = await input.client.listScreenshots(projectId, {
    stringIds: [stringId],
    maxItems: maxCrowdinScreenshotsPerSegment,
  });

  return {
    screenshots: screenshots.flatMap((screenshot) => mapCrowdinScreenshot(screenshot, stringId)),
  };
}

function mapCrowdinScreenshot(
  screenshot: Awaited<ReturnType<CrowdinApiClient["listScreenshots"]>>[number],
  stringId: number,
): CatVisualContextScreenshot[] {
  const imageUrl = screenshot.webUrl?.trim();
  if (!imageUrl) {
    return [];
  }

  const markers = (screenshot.tags ?? [])
    .filter((tag) => tag.stringId === stringId && tag.position)
    .map((tag) =>
      pixelRectToPercentMarkers({
        width: screenshot.size?.width,
        height: screenshot.size?.height,
        left: tag.position?.x ?? 0,
        top: tag.position?.y ?? 0,
        widthPx: tag.position?.width ?? 0,
        heightPx: tag.position?.height ?? 0,
      }),
    )
    .filter((marker): marker is NonNullable<typeof marker> => marker != null);

  return [
    {
      id: String(screenshot.id),
      name: screenshot.name?.trim() || null,
      imageUrl,
      width: screenshot.size?.width ?? null,
      height: screenshot.size?.height ?? null,
      markers,
    },
  ];
}
