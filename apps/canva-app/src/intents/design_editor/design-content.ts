import { editContent } from "@canva/design";

import { segmentKey } from "./segment-file";
import type { DesignSegment, ExtractedDesignContent } from "./types";

type RichtextRange = {
  readPlaintext: () => string;
  readTextRegions: () => Array<{ text: string }>;
  replaceText: (range: { index: number; length: number }, text: string) => void;
};

function findRegionOffsets(plaintext: string, regions: Array<{ text: string }>): number[] {
  const offsets: number[] = [];
  let searchFrom = 0;

  for (const region of regions) {
    const regionIndex = plaintext.indexOf(region.text, searchFrom);
    if (regionIndex === -1) {
      offsets.push(searchFrom);
      searchFrom += region.text.length;
    } else {
      offsets.push(regionIndex);
      searchFrom = regionIndex + region.text.length;
    }
  }

  return offsets;
}

export function extractSegmentsFromRanges(
  ranges: readonly RichtextRange[],
  preserveFormatting: boolean,
): DesignSegment[] {
  const segments: DesignSegment[] = [];

  ranges.forEach((range, contentIndex) => {
    if (preserveFormatting) {
      const regions = range.readTextRegions();
      regions.forEach((region, regionIndex) => {
        if (region.text.length === 0) {
          return;
        }

        segments.push({
          key: segmentKey(contentIndex, regionIndex),
          contentIndex,
          regionIndex,
          text: region.text,
        });
      });
      return;
    }

    const plaintext = range.readPlaintext();
    if (plaintext.length === 0) {
      return;
    }

    segments.push({
      key: segmentKey(contentIndex, 0),
      contentIndex,
      regionIndex: 0,
      text: plaintext,
    });
  });

  return segments;
}

export function applyTranslationsToRanges(
  ranges: readonly RichtextRange[],
  translations: Record<string, string>,
  preserveFormatting: boolean,
): void {
  ranges.forEach((range, contentIndex) => {
    if (preserveFormatting) {
      const regions = range.readTextRegions();
      const plaintext = range.readPlaintext();
      const offsets = findRegionOffsets(plaintext, regions);

      for (let regionIndex = regions.length - 1; regionIndex >= 0; regionIndex -= 1) {
        const region = regions[regionIndex];
        const translatedText = translations[segmentKey(contentIndex, regionIndex)];
        const offset = offsets[regionIndex];

        if (!region || translatedText == null || offset == null) {
          continue;
        }

        range.replaceText(
          {
            index: offset,
            length: region.text.length,
          },
          translatedText,
        );
      }
      return;
    }

    const plaintext = range.readPlaintext();
    const translatedText = translations[segmentKey(contentIndex, 0)];
    if (translatedText == null || plaintext.length === 0) {
      return;
    }

    range.replaceText({ index: 0, length: plaintext.length }, translatedText);
  });
}

export async function extractCurrentPageContent(
  preserveFormatting: boolean,
): Promise<ExtractedDesignContent> {
  let segments: DesignSegment[] = [];

  await editContent(
    {
      contentType: "richtext",
      target: "current_page",
    },
    async (session) => {
      segments = extractSegmentsFromRanges(session.contents, preserveFormatting);
    },
  );

  return { segments, preserveFormatting };
}

export async function applyTranslationsToCurrentPage(
  translations: Record<string, string>,
  preserveFormatting: boolean,
): Promise<void> {
  await editContent(
    {
      contentType: "richtext",
      target: "current_page",
    },
    async (session) => {
      applyTranslationsToRanges(session.contents, translations, preserveFormatting);
      await session.sync();
    },
  );
}
