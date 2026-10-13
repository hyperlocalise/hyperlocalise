/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { editContent, openDesign } from "@canva/design";

import {
  countTranslatedRegionsForContentIndex,
  lookupTranslatedText,
  normalizePageScopedTranslationKeys,
  parseTranslationFile,
  segmentKey,
} from "./segment-file";
import type { DesignPageInfo, DesignSegment, ExtractedDesignContent } from "./types";

type RichtextRange = {
  readPlaintext: () => string;
  readTextRegions: () => Array<{ text: string }>;
  replaceText: (range: { index: number; length: number }, text: string) => void;
};

interface DesignElementNode {
  type: string;
  locked?: boolean;
  text?: RichtextRange;
  contents?: ElementCollection;
}

interface ElementCollection {
  forEach?: (callback: (element: DesignElementNode) => void) => void;
  toArray?: () => readonly DesignElementNode[];
}

type PageRef = {
  type: string;
  locked: boolean;
};

type OpenedPage = {
  type?: string;
  locked?: boolean;
  elements: ElementCollection;
};

type AllPagesSession = {
  pageRefs: {
    toArray: () => PageRef[];
  };
  helpers: {
    openPage: (
      pageRef: PageRef,
      callback: (result: { page: OpenedPage }) => Promise<void>,
    ) => Promise<{ status: string; reason?: string }>;
  };
  sync: () => Promise<void>;
};

type CurrentPageSession = {
  page: OpenedPage;
  sync: () => Promise<void>;
};

type EditableRichtextRange = RichtextRange & {
  deleted?: boolean;
};

type RichtextContentSession = {
  contents: readonly EditableRichtextRange[];
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

async function openCurrentPage(
  callback: (session: CurrentPageSession) => Promise<void>,
): Promise<void> {
  await openDesign(
    { type: "current_page" } as unknown as Parameters<typeof openDesign>[0],
    callback as unknown as Parameters<typeof openDesign>[1],
  );
}

async function editCurrentPageRichtext(
  callback: (session: RichtextContentSession) => Promise<void>,
): Promise<void> {
  await editContent(
    { contentType: "richtext", target: "current_page" } as unknown as Parameters<
      typeof editContent
    >[0],
    callback as unknown as Parameters<typeof editContent>[1],
  );
}

function eachElement(
  elements: ElementCollection | readonly DesignElementNode[] | DesignElementNode[],
  visitor: (element: DesignElementNode) => void,
): void {
  if (Array.isArray(elements)) {
    for (const element of elements) {
      visitor(element);
    }
    return;
  }

  const collection = elements as ElementCollection;
  if (typeof collection.forEach === "function") {
    collection.forEach(visitor);
    return;
  }

  for (const element of collection.toArray?.() ?? []) {
    visitor(element);
  }
}

function walkTextElements(
  elements: ElementCollection | readonly DesignElementNode[] | DesignElementNode[],
  visitor: (range: RichtextRange) => void,
): void {
  eachElement(elements, (element) => {
    if (element.locked) {
      return;
    }

    if (element.type === "text" && element.text) {
      visitor(element.text);
    }

    if (element.type === "group" && element.contents) {
      walkTextElements(element.contents, visitor);
    }
  });
}

function normalizeTranslations(translations: Record<string, string>): Record<string, string> {
  return parseTranslationFile(translations);
}

function applyTranslationsToPageElements(
  elements: ElementCollection | readonly DesignElementNode[] | DesignElementNode[],
  translations: Record<string, string>,
  preserveFormatting: boolean,
  pageIndex?: number,
): number {
  const normalized = normalizeTranslations(translations);
  let contentIndex = 0;
  let replaced = 0;

  walkTextElements(elements, (range) => {
    replaced += applyTranslationsToIndexedRange(
      range,
      normalized,
      contentIndex,
      preserveFormatting,
      pageIndex,
    );
    if (rangeHasApplyableContent(range, preserveFormatting)) {
      contentIndex += 1;
    }
  });

  return replaced;
}

function rangeHasApplyableContent(range: RichtextRange, preserveFormatting: boolean): boolean {
  if (preserveFormatting) {
    return range.readTextRegions().some((region) => region.text.length > 0);
  }
  return range.readPlaintext().length > 0;
}

function applyTranslationsToIndexedRange(
  range: RichtextRange,
  translations: Record<string, string>,
  contentIndex: number,
  preserveFormatting: boolean,
  pageIndex?: number,
): number {
  if (!rangeHasApplyableContent(range, preserveFormatting)) {
    return 0;
  }
  return applyTranslationsToRange(range, translations, contentIndex, preserveFormatting, pageIndex);
}

function applyTranslationsToRichtextContents(
  contents: readonly EditableRichtextRange[],
  translations: Record<string, string>,
  preserveFormatting: boolean,
  pageIndex?: number,
): number {
  const normalized = normalizeTranslations(translations);
  let contentIndex = 0;
  let replaced = 0;

  for (const range of contents) {
    if (range.deleted) {
      continue;
    }
    replaced += applyTranslationsToIndexedRange(
      range,
      normalized,
      contentIndex,
      preserveFormatting,
      pageIndex,
    );
    if (rangeHasApplyableContent(range, preserveFormatting)) {
      contentIndex += 1;
    }
  }

  return replaced;
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

function wholeFormattedRangeReplacement(
  regions: Array<{ text: string }>,
  translations: Record<string, string>,
  contentIndex: number,
  pageIndex?: number,
): string | undefined {
  if (regions.length <= 1) {
    return undefined;
  }

  const firstTranslation = lookupTranslatedText(translations, contentIndex, 0, pageIndex);
  if (firstTranslation == null || firstTranslation === regions[0]?.text) {
    return undefined;
  }

  const trailingRegions = regions.slice(1);
  const trailingSources = trailingRegions.map((region) => region.text.trim()).filter(Boolean);
  if (trailingSources.length === 0) {
    return undefined;
  }

  // Later runs that keep leading whitespace are usually intentional styled splits.
  if (trailingRegions.some((region) => /^\s/.test(region.text))) {
    return undefined;
  }

  const trailingLooksLikeSuffixWords = trailingSources.every(
    (text) => text.length <= 24 && !/\s/.test(text),
  );
  if (!trailingLooksLikeSuffixWords) {
    return undefined;
  }

  const assembled = regions
    .map(
      (region, regionIndex) =>
        lookupTranslatedText(translations, contentIndex, regionIndex, pageIndex) ?? region.text,
    )
    .join("");
  const normalizedFirst = firstTranslation.replace(/\s+/g, " ").trim();
  const normalizedAssembled = assembled.replace(/\s+/g, " ").trim();
  if (normalizedAssembled === normalizedFirst) {
    return undefined;
  }

  if (normalizedAssembled.startsWith(normalizedFirst)) {
    return firstTranslation;
  }

  return undefined;
}

function wholeTextReplacementForFormattedRange(
  range: RichtextRange,
  regions: Array<{ text: string }>,
  translations: Record<string, string>,
  contentIndex: number,
  pageIndex?: number,
): string | undefined {
  if (regions.length <= 1) {
    return undefined;
  }

  const plaintext = range.readPlaintext();
  const firstTranslation = lookupTranslatedText(translations, contentIndex, 0, pageIndex);
  if (firstTranslation == null || firstTranslation === plaintext) {
    return undefined;
  }

  // Hyperlocalise often has one string per text box (canva.segment.0.0) while Canva
  // still exposes multiple styled runs — replace the full box instead of the first run only.
  if (countTranslatedRegionsForContentIndex(translations, contentIndex) === 1) {
    return firstTranslation;
  }

  return wholeFormattedRangeReplacement(regions, translations, contentIndex, pageIndex);
}

export function applyTranslationsToRange(
  range: RichtextRange,
  translations: Record<string, string>,
  contentIndex: number,
  preserveFormatting: boolean,
  pageIndex?: number,
): number {
  let replaced = 0;

  if (preserveFormatting) {
    const regions = range.readTextRegions();
    const plaintext = range.readPlaintext();
    const wholeReplacement = wholeTextReplacementForFormattedRange(
      range,
      regions,
      translations,
      contentIndex,
      pageIndex,
    );
    if (wholeReplacement != null && wholeReplacement !== plaintext) {
      range.replaceText({ index: 0, length: plaintext.length }, wholeReplacement);
      return 1;
    }

    const offsets = findRegionOffsets(plaintext, regions);

    for (let regionIndex = regions.length - 1; regionIndex >= 0; regionIndex -= 1) {
      const region = regions[regionIndex];
      const translatedText = lookupTranslatedText(
        translations,
        contentIndex,
        regionIndex,
        pageIndex,
      );
      const offset = offsets[regionIndex];

      if (!region || translatedText == null || offset == null || translatedText === region.text) {
        continue;
      }

      range.replaceText(
        {
          index: offset,
          length: region.text.length,
        },
        translatedText,
      );
      replaced += 1;
    }
    return replaced;
  }

  const plaintext = range.readPlaintext();
  const translatedText = lookupTranslatedText(translations, contentIndex, 0, pageIndex);
  if (translatedText == null || plaintext.length === 0 || translatedText === plaintext) {
    return 0;
  }

  range.replaceText({ index: 0, length: plaintext.length }, translatedText);
  return 1;
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

        walkTextElements(pageResult.page.elements, (range) => {
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

export async function applyTranslationsToCurrentPage(
  translations: Record<string, string>,
  preserveFormatting: boolean,
  pageIndex?: number,
): Promise<number> {
  let replaced = 0;

  try {
    await editCurrentPageRichtext(async (session) => {
      replaced = applyTranslationsToRichtextContents(
        session.contents,
        translations,
        preserveFormatting,
        pageIndex,
      );
      if (replaced > 0) {
        await session.sync();
      }
    });
    return replaced;
  } catch {
    // Fall back when editContent is unavailable on this surface.
  }

  await openCurrentPage(async (session) => {
    if (session.page.type === "unsupported" || session.page.locked) {
      throw new Error("This Canva page is locked or cannot be edited.");
    }

    replaced = applyTranslationsToPageElements(
      session.page.elements,
      translations,
      preserveFormatting,
      pageIndex,
    );

    if (replaced > 0) {
      await session.sync();
    }
  });

  return replaced;
}

export async function applyTranslationsToDesign(
  pages: Array<{ pageIndex: number; translations: Record<string, string> }>,
  preserveFormatting: boolean,
): Promise<number> {
  const translationsByPage = new Map(pages.map((page) => [page.pageIndex, page.translations]));
  let replaced = 0;
  let openedPages = 0;

  await openAllPages(async (session) => {
    const pageRefs = session.pageRefs.toArray();

    for (const [pageIndex, pageRef] of pageRefs.entries()) {
      const rawTranslations = translationsByPage.get(pageIndex);
      if (!rawTranslations || pageRef.type !== "absolute" || pageRef.locked) {
        continue;
      }
      const translations = normalizePageScopedTranslationKeys(rawTranslations, pageIndex);

      const opened = await session.helpers.openPage(pageRef, async (pageResult) => {
        if (pageResult.page.type === "unsupported" || pageResult.page.locked) {
          return;
        }

        replaced += applyTranslationsToPageElements(
          pageResult.page.elements,
          translations,
          preserveFormatting,
          pageIndex,
        );
      });

      if (opened.status === "executed") {
        openedPages += 1;
      }
    }

    if (replaced > 0) {
      await session.sync();
    }
  });

  if (pages.length > 0 && openedPages === 0) {
    throw new Error("Canva skipped those pages. Open an editable page, then apply again.");
  }

  return replaced;
}
