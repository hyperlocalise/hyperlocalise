import { openDesign } from "@canva/design";

import { segmentKey } from "./segment-file";
import type { DesignPageInfo, DesignSegment, ExtractedDesignContent } from "./types";

type RichtextRange = {
  readPlaintext: () => string;
  readTextRegions: () => Array<{ text: string }>;
  replaceText: (range: { index: number; length: number }, text: string) => void;
};

type DesignElementNode = {
  type: string;
  locked?: boolean;
  text?: RichtextRange;
  contents?: {
    toArray: () => DesignElementNode[];
  };
};

type PageElementList = {
  toArray: () => DesignElementNode[];
};

type PageRef = {
  type: string;
  locked: boolean;
};

type AllPagesSession = {
  pageRefs: {
    toArray: () => PageRef[];
  };
  helpers: {
    openPage: (
      pageRef: PageRef,
      callback: (result: { page: { elements: PageElementList } }) => Promise<void>,
    ) => Promise<{ status: string }>;
  };
  sync: () => Promise<void>;
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

async function openAllPages(callback: (session: AllPagesSession) => Promise<void>): Promise<void> {
  await openDesign(
    { type: "all_pages" } as unknown as Parameters<typeof openDesign>[0],
    callback as unknown as Parameters<typeof openDesign>[1],
  );
}

function walkTextElements(
  elements: DesignElementNode[],
  visitor: (range: RichtextRange) => void,
): void {
  for (const element of elements) {
    if (element.locked) {
      continue;
    }

    if (element.type === "text" && element.text) {
      visitor(element.text);
    }

    if (element.type === "group" && element.contents) {
      walkTextElements(element.contents.toArray(), visitor);
    }
  }
}

export function extractSegmentsFromRange(
  range: RichtextRange,
  pageIndex: number,
  contentIndex: number,
  preserveFormatting: boolean,
): DesignSegment[] {
  if (preserveFormatting) {
    return range.readTextRegions().flatMap((region, regionIndex) => {
      if (region.text.length === 0) {
        return [];
      }

      return [
        {
          key: segmentKey(pageIndex, contentIndex, regionIndex),
          pageIndex,
          contentIndex,
          regionIndex,
          text: region.text,
        },
      ];
    });
  }

  const plaintext = range.readPlaintext();
  if (plaintext.length === 0) {
    return [];
  }

  return [
    {
      key: segmentKey(pageIndex, contentIndex, 0),
      pageIndex,
      contentIndex,
      regionIndex: 0,
      text: plaintext,
    },
  ];
}

export function applyTranslationsToRange(
  range: RichtextRange,
  translations: Record<string, string>,
  pageIndex: number,
  contentIndex: number,
  preserveFormatting: boolean,
): void {
  if (preserveFormatting) {
    const regions = range.readTextRegions();
    const plaintext = range.readPlaintext();
    const offsets = findRegionOffsets(plaintext, regions);

    for (let regionIndex = regions.length - 1; regionIndex >= 0; regionIndex -= 1) {
      const region = regions[regionIndex];
      const translatedText = translations[segmentKey(pageIndex, contentIndex, regionIndex)];
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
  const translatedText = translations[segmentKey(pageIndex, contentIndex, 0)];
  if (translatedText == null || plaintext.length === 0) {
    return;
  }

  range.replaceText({ index: 0, length: plaintext.length }, translatedText);
}

export function buildPageSummaries(pageRefs: PageRef[]): DesignPageInfo[] {
  return pageRefs.map((pageRef, index) => ({
    index,
    label: `Page ${index + 1}`,
    locked: pageRef.type === "absolute" ? pageRef.locked : false,
    editable: pageRef.type === "absolute" && !pageRef.locked,
  }));
}

export async function listDesignPages(): Promise<DesignPageInfo[]> {
  let pages: DesignPageInfo[] = [];

  await openAllPages(async (session) => {
    pages = buildPageSummaries(session.pageRefs.toArray());
  });

  return pages;
}

export async function extractDesignContent(
  pageIndices: number[],
  preserveFormatting: boolean,
): Promise<ExtractedDesignContent> {
  const selectedPages = new Set(pageIndices);
  const segments: DesignSegment[] = [];

  await openAllPages(async (session) => {
    const pageRefs = session.pageRefs.toArray();

    for (const [pageIndex, pageRef] of pageRefs.entries()) {
      if (!selectedPages.has(pageIndex) || pageRef.type !== "absolute" || pageRef.locked) {
        continue;
      }

      await session.helpers.openPage(pageRef, async (pageResult) => {
        let contentIndex = 0;

        walkTextElements(pageResult.page.elements.toArray(), (range) => {
          const pageSegments = extractSegmentsFromRange(
            range,
            pageIndex,
            contentIndex,
            preserveFormatting,
          );

          if (pageSegments.length > 0) {
            segments.push(...pageSegments);
            contentIndex += 1;
          }
        });
      });
    }
  });

  return {
    segments,
    pageIndices,
    preserveFormatting,
  };
}

export async function applyTranslationsToDesign(
  translations: Record<string, string>,
  pageIndices: number[],
  preserveFormatting: boolean,
): Promise<void> {
  const selectedPages = new Set(pageIndices);

  await openAllPages(async (session) => {
    const pageRefs = session.pageRefs.toArray();

    for (const [pageIndex, pageRef] of pageRefs.entries()) {
      if (!selectedPages.has(pageIndex) || pageRef.type !== "absolute" || pageRef.locked) {
        continue;
      }

      await session.helpers.openPage(pageRef, async (pageResult) => {
        let contentIndex = 0;

        walkTextElements(pageResult.page.elements.toArray(), (range) => {
          const plaintext = range.readPlaintext();
          const regions = range.readTextRegions();
          const hasContent = preserveFormatting
            ? regions.some((region) => region.text.length > 0)
            : plaintext.length > 0;

          if (!hasContent) {
            return;
          }

          applyTranslationsToRange(
            range,
            translations,
            pageIndex,
            contentIndex,
            preserveFormatting,
          );
          contentIndex += 1;
        });
      });
    }

    await session.sync();
  });
}
