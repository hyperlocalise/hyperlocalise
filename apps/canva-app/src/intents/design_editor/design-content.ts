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
import { openDesign } from "@canva/design";

import { normalizeSegmentText } from "./segment-file";
import type {
  ApplyResult,
  CanvaPullEntry,
  CanvaPullPage,
  DesignPageInfo,
  DesignSegment,
  ExtractedDesignContent,
} from "./types";

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

async function openAllPages(callback: (session: AllPagesSession) => Promise<void>): Promise<void> {
  await openDesign(
    { type: "all_pages" } as unknown as Parameters<typeof openDesign>[0],
    callback as unknown as Parameters<typeof openDesign>[1],
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

export function buildApplyTextIndex(entries: CanvaPullEntry[]): Map<string, CanvaPullEntry> {
  const index = new Map<string, CanvaPullEntry>();
  const ambiguous = new Set<string>();

  for (const entry of entries) {
    const sourceNorm = normalizeSegmentText(entry.source);
    if (sourceNorm) {
      index.set(sourceNorm, entry);
    }
  }

  for (const entry of entries) {
    const extras = [...entry.knownTexts];
    if (entry.target != null) {
      extras.push(entry.target);
    }
    for (const text of extras) {
      const norm = normalizeSegmentText(text);
      if (!norm || ambiguous.has(norm)) {
        continue;
      }
      const existing = index.get(norm);
      if (existing && existing.key !== entry.key) {
        index.delete(norm);
        ambiguous.add(norm);
        continue;
      }
      if (!existing) {
        index.set(norm, entry);
      }
    }
  }

  return index;
}

function applyEntryToRange(range: RichtextRange, entry: CanvaPullEntry, result: ApplyResult): void {
  if (entry.target == null) {
    result.untranslated += 1;
    return;
  }

  const plaintext = range.readPlaintext();
  if (plaintext === entry.target) {
    result.alreadyApplied += 1;
    return;
  }

  // One Hyperlocalise string per text box: replace the full plaintext range even when Canva
  // exposes multiple styled runs (e.g. "Buy " + "Now"), so the complete translation is applied.
  range.replaceText({ index: 0, length: plaintext.length }, entry.target);
  result.replaced += 1;
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
  sourcePages: CanvaPullPage[] = [],
): Promise<ExtractedDesignContent> {
  const selectedPages = new Set(pageIndices);
  const sourceByPage = new Map(sourcePages.map((page) => [page.pageIndex, page]));
  const segments: DesignSegment[] = [];

  await openAllPages(async (session) => {
    const pageRefs = session.pageRefs.toArray();

    for (const [pageIndex, pageRef] of pageRefs.entries()) {
      if (!selectedPages.has(pageIndex) || pageRef.type !== "absolute" || pageRef.locked) {
        continue;
      }
      const sourcePage = sourceByPage.get(pageIndex);
      const textIndex =
        sourcePage && !sourcePage.needsReupload ? buildApplyTextIndex(sourcePage.entries) : null;

      await session.helpers.openPage(pageRef, async (pageResult) => {
        walkTextElements(pageResult.page.elements, (range) => {
          const text = range.readPlaintext();
          const norm = normalizeSegmentText(text);
          if (!norm) {
            return;
          }
          const entry = textIndex?.get(norm);
          segments.push({ pageIndex, text: entry?.source ?? text });
        });
      });
    }
  });

  return {
    segments,
    pageIndices,
  };
}

export async function applyTranslationsToDesign(pages: CanvaPullPage[]): Promise<ApplyResult> {
  const result: ApplyResult = {
    replaced: 0,
    alreadyApplied: 0,
    skipped: 0,
    untranslated: 0,
    pagesNeedingUpload: [],
    appliedPageIndices: [],
  };
  const pagesByIndex = new Map<number, CanvaPullPage>();
  for (const page of pages) {
    if (page.needsReupload) {
      result.pagesNeedingUpload.push(page.pageIndex);
      continue;
    }
    pagesByIndex.set(page.pageIndex, page);
  }

  let openedPages = 0;
  const requestedApplyPages = pages.filter((page) => !page.needsReupload);

  if (requestedApplyPages.length > 0) {
    await openAllPages(async (session) => {
      const pageRefs = session.pageRefs.toArray();

      for (const [pageIndex, pageRef] of pageRefs.entries()) {
        const page = pagesByIndex.get(pageIndex);
        if (!page || pageRef.type !== "absolute" || pageRef.locked) {
          continue;
        }
        const index = buildApplyTextIndex(page.entries);

        const opened = await session.helpers.openPage(pageRef, async (pageResult) => {
          if (pageResult.page.type === "unsupported" || pageResult.page.locked) {
            return;
          }

          const matchedBefore = result.replaced + result.alreadyApplied;
          walkTextElements(pageResult.page.elements, (range) => {
            const plaintext = range.readPlaintext();
            const norm = normalizeSegmentText(plaintext);
            if (!norm) {
              return;
            }
            const entry = index.get(norm);
            if (!entry) {
              result.skipped += 1;
              return;
            }
            applyEntryToRange(range, entry, result);
          });
          if (result.replaced + result.alreadyApplied > matchedBefore) {
            result.appliedPageIndices.push(pageIndex);
          }
        });

        if (opened.status === "executed") {
          openedPages += 1;
        }
      }

      if (result.replaced > 0) {
        await session.sync();
      }
    });
  }

  if (requestedApplyPages.length > 0 && openedPages === 0 && result.replaced === 0) {
    throw new Error("Canva skipped those pages. Open an editable page, then apply again.");
  }

  return result;
}
