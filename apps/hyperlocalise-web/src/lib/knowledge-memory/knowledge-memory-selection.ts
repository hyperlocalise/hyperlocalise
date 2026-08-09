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
import {
  KNOWLEDGE_MEMORY_MAX_SELECTED_SEGMENTS,
  KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
  KNOWLEDGE_MEMORY_SMALL_CONTENT_MAX_LENGTH,
} from "./knowledge-memory.shared";
import {
  extractMarkdownMemoryHeadings,
  normalizeKnowledgeMemoryForSelection,
  parseMarkdownMemory,
} from "./knowledge-memory-markdown-parser";
import { buildSegmentExcerpt, truncateToBudget } from "./knowledge-memory-excerpt";
import {
  buildKnowledgeMemoryInputLocales,
  buildKnowledgeMemoryQueryTokens,
  retrieveKnowledgeMemorySegmentsLexicallyWithTokens,
} from "./knowledge-memory-lexical-retriever";
import type {
  KnowledgeMemoryFallbackMode,
  KnowledgeMemoryRetriever,
  KnowledgeMemorySegment,
  RankedKnowledgeMemorySegment,
  SelectedKnowledgeMemoryContext,
  SelectedKnowledgeMemorySegment,
  SelectKnowledgeMemoryContextInput,
} from "./knowledge-memory-selection.types";

export { parseMarkdownMemory } from "./knowledge-memory-markdown-parser";
export type {
  KnowledgeMemoryFallbackMode,
  KnowledgeMemoryRetriever,
  KnowledgeMemoryRetrieverInput,
  KnowledgeMemorySegment,
  KnowledgeMemorySegmentKind,
  RankedKnowledgeMemorySegment,
  SelectedKnowledgeMemoryContext,
  SelectedKnowledgeMemoryMetrics,
  SelectedKnowledgeMemorySegment,
  SelectKnowledgeMemoryContextInput,
} from "./knowledge-memory-selection.types";

export type SelectKnowledgeMemoryContextOptions = {
  retrieveSegments?: KnowledgeMemoryRetriever;
};

function appendWithinBudget(lines: string[], line: string, maxChars: number) {
  const next = [...lines, line].join("\n");
  if (next.length > maxChars && lines.length > 0) {
    return false;
  }
  lines.push(
    next.length > maxChars ? `${line.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...` : line,
  );
  return true;
}

function reductionPercent(wholeChars: number, selectedChars: number) {
  if (wholeChars === 0) {
    return 0;
  }
  return Number((((wholeChars - selectedChars) / wholeChars) * 100).toFixed(2));
}

function normalizeInputLocale(locale: string | null | undefined) {
  return locale?.trim().toLowerCase().replace(/_/g, "-") || null;
}

function requestedTargetLocales(input: SelectKnowledgeMemoryContextInput) {
  return [
    ...new Set(
      [input.targetLocale, ...(input.targetLocales ?? [])]
        .map(normalizeInputLocale)
        .filter((locale): locale is string => Boolean(locale)),
    ),
  ];
}

function requestedTargetLocaleCount(input: SelectKnowledgeMemoryContextInput) {
  return requestedTargetLocales(input).length;
}

function selectiveSegmentLimit(input: SelectKnowledgeMemoryContextInput) {
  return Math.max(KNOWLEDGE_MEMORY_MAX_SELECTED_SEGMENTS, requestedTargetLocaleCount(input));
}

function headingLocaleMarkers(segment: KnowledgeMemorySegment) {
  return new Set(
    segment.headingPath.flatMap((heading) =>
      heading
        .toLowerCase()
        .replace(/_/g, "-")
        .split(/[^a-z0-9-]+/)
        .filter(Boolean),
    ),
  );
}

function segmentMatchesTargetLocale(segment: KnowledgeMemorySegment, targetLocale: string) {
  const markers = headingLocaleMarkers(segment);
  const language = targetLocale.split("-")[0];
  return markers.has(targetLocale) || Boolean(language && markers.has(language));
}

function selectRankedSegmentsForTargets(
  rankedSegments: RankedKnowledgeMemorySegment[],
  input: SelectKnowledgeMemoryContextInput,
) {
  const selectedIds = new Set<string>();

  for (const targetLocale of requestedTargetLocales(input)) {
    const isCovered = rankedSegments.some(
      ({ segment }) =>
        selectedIds.has(segment.id) && segmentMatchesTargetLocale(segment, targetLocale),
    );
    if (isCovered) {
      continue;
    }

    const localeMatch = rankedSegments.find(({ segment }) =>
      segmentMatchesTargetLocale(segment, targetLocale),
    );
    if (localeMatch) {
      selectedIds.add(localeMatch.segment.id);
    }
  }

  const limit = selectiveSegmentLimit(input);
  for (const { segment } of rankedSegments) {
    if (selectedIds.size >= limit) {
      break;
    }
    selectedIds.add(segment.id);
  }

  return rankedSegments
    .filter(({ segment }) => selectedIds.has(segment.id))
    .map(({ segment }) => segment);
}

function maxCharsPerSelectedSegment(input: {
  maxChars: number;
  selectedSegmentCount: number;
  shouldBalance: boolean;
  reservedChars?: number;
}) {
  if (!input.shouldBalance) {
    return undefined;
  }

  if (input.selectedSegmentCount <= 1) {
    return undefined;
  }

  const availableChars = Math.max(0, input.maxChars - (input.reservedChars ?? 0));

  return Math.max(
    80,
    Math.floor(
      (availableChars - Math.max(0, input.selectedSegmentCount - 1)) / input.selectedSegmentCount,
    ),
  );
}

function headingFallbackReservedChars(headingFallbackText: string, maxChars: number) {
  return Math.min(headingFallbackText.length, Math.min(maxChars, 1_200)) + 1;
}

// Floor (not a ceiling) for the no-query-token-match fallback preview only — see fallbackMaxChars
// below. Keeps that preview's own room decoupled from a small outer maxChars.
const minFallbackPreviewChars = 900;

function buildSelectedContext(input: {
  wholeMemoryChars: number;
  selectedSegments: KnowledgeMemorySegment[];
  fallbackMode: KnowledgeMemoryFallbackMode;
  maxChars: number;
  headingFallbackText?: string;
  maxSegmentChars?: number;
  /**
   * Query tokens used to excerpt the sentence/bullet within each selected segment that actually
   * matches, instead of a query-independent prefix slice. Only meaningful for the "selective"
   * fallback mode — general/fallback/raw paths pass none, so their output stays unchanged.
   */
  queryTokens?: Set<string>;
  /** Target locales for heading locale-marker matching during excerpt packing. */
  inputLocales?: string[];
}) {
  const lines: string[] = [];
  const segments: SelectedKnowledgeMemorySegment[] = [];
  const queryTokens = input.queryTokens ?? new Set<string>();
  const inputLocales = input.inputLocales ?? [];

  if (input.headingFallbackText) {
    appendWithinBudget(
      lines,
      truncateToBudget(input.headingFallbackText, Math.min(input.maxChars, 1_200)),
      input.maxChars,
    );
  }

  for (const segment of input.selectedSegments) {
    // Bound by input.maxChars even when no explicit per-segment budget was computed (single
    // selected segment, not balancing across locales): otherwise buildSegmentExcerpt centers its
    // match inside the full caller-provided budget, and the dumb prefix-cut in appendWithinBudget
    // below can then chop that correctly-centered excerpt back down to the real (smaller) budget
    // from the front, discarding the match this function exists to keep. The no-match fallback
    // doesn't center on anything, so it isn't at risk from that same double-truncation — pass it the
    // *unclamped* per-segment share (still respecting a genuine balanced share when one exists, via
    // input.maxSegmentChars) so a segment with no query-token match doesn't lose guidance from the
    // end of an otherwise-fitting preview just because this path also protects the match-centering
    // one below it.
    //
    // Falls back to input.maxChars itself, not a fixed default, when there's no balanced share: a
    // single selected segment has nothing else competing for the budget, so it should get all of
    // whatever the caller actually allowed instead of an arbitrary smaller cap.
    //
    // fallbackMaxChars (the no-match path) keeps a floor under that instead of using input.maxChars
    // directly: unlike the match-centered path above, it isn't re-trimmed from the correct end by
    // appendWithinBudget's prefix cut on compactText, so a tiny outer maxChars would otherwise chop
    // the one preview stored in segment metadata down to the same tiny size for no reason — nothing
    // downstream needs it that small, since compactText enforces the real outer budget regardless.
    const preview = buildSegmentExcerpt({
      segment,
      queryTokens,
      inputLocales,
      maxChars: Math.min(input.maxSegmentChars ?? input.maxChars, input.maxChars),
      fallbackMaxChars: input.maxSegmentChars ?? Math.max(input.maxChars, minFallbackPreviewChars),
    });

    if (!appendWithinBudget(lines, preview, input.maxChars)) {
      break;
    }
    segments.push({
      id: segment.id,
      headingPath: segment.headingPath,
      startLine: segment.startLine,
      endLine: segment.endLine,
      preview,
    });
  }

  const compactText = lines.join("\n");
  const matchedHeadingPaths = [
    ...new Set(segments.map((segment) => segment.headingPath.join(" > "))),
  ];

  return {
    compactText,
    segments,
    metrics: {
      selectedMemoryCount: segments.length,
      selectedMemoryChars: compactText.length,
      wholeMemoryChars: input.wholeMemoryChars,
      reductionPercent: reductionPercent(input.wholeMemoryChars, compactText.length),
      matchedHeadingPaths,
      fallbackMode: input.fallbackMode,
    },
  };
}

function buildWholeSmallContext(content: string): SelectedKnowledgeMemoryContext {
  const compactText = content.trim();
  return {
    compactText,
    segments: [],
    metrics: {
      selectedMemoryCount: 0,
      selectedMemoryChars: compactText.length,
      wholeMemoryChars: compactText.length,
      reductionPercent: 0,
      matchedHeadingPaths: [],
      fallbackMode: "whole_small",
    },
  };
}

function buildEmptyContext(
  wholeMemoryChars: number,
  fallbackMode: KnowledgeMemoryFallbackMode,
): SelectedKnowledgeMemoryContext {
  return {
    compactText: "",
    segments: [],
    metrics: {
      selectedMemoryCount: 0,
      selectedMemoryChars: 0,
      wholeMemoryChars,
      reductionPercent: reductionPercent(wholeMemoryChars, 0),
      matchedHeadingPaths: [],
      fallbackMode,
    },
  };
}

function headingFallbackPriority(heading: string) {
  if (
    /brand|voice|tone|style|glossary|terminology|protected|token|never|avoid|locale|rule/i.test(
      heading,
    )
  ) {
    return 0;
  }
  return 1;
}

function buildHeadingFallbackText(content: string) {
  const headings = extractMarkdownMemoryHeadings(content);

  if (headings.length === 0) {
    return content;
  }

  const orderedHeadings = headings
    .map((heading, index) => ({ ...heading, index }))
    .sort((a, b) => {
      const priorityDelta = headingFallbackPriority(a.text) - headingFallbackPriority(b.text);
      return priorityDelta === 0 ? a.index - b.index : priorityDelta;
    });

  return [
    "Memory.md heading fallback:",
    ...orderedHeadings.map((heading) => {
      const indent = "  ".repeat(Math.max(0, heading.level - 1));
      return `${indent}- ${heading.text}`;
    }),
  ].join("\n");
}

function fallbackSegmentPriority(segment: KnowledgeMemorySegment) {
  return Math.min(...segment.headingPath.map(headingFallbackPriority));
}

function orderFallbackSegments(segments: KnowledgeMemorySegment[]) {
  return [...segments].sort((a, b) => {
    const priorityDelta = fallbackSegmentPriority(a) - fallbackSegmentPriority(b);
    return priorityDelta === 0 ? a.startLine - b.startLine : priorityDelta;
  });
}

function buildRawFallbackContext(
  content: string,
  maxChars: number,
): SelectedKnowledgeMemoryContext {
  const compactText = truncateToBudget(buildHeadingFallbackText(content), maxChars);

  return {
    compactText,
    segments: [],
    metrics: {
      selectedMemoryCount: 0,
      selectedMemoryChars: compactText.length,
      wholeMemoryChars: content.length,
      reductionPercent: reductionPercent(content.length, compactText.length),
      matchedHeadingPaths: [],
      fallbackMode: "fallback",
    },
  };
}

function findGeneralFallback(segments: KnowledgeMemorySegment[]) {
  return segments.find((segment) =>
    segment.headingPath.some((heading) => /^(general|overview|summary)$/i.test(heading.trim())),
  );
}

function isPreferredFallbackSegment(segment: KnowledgeMemorySegment) {
  return segment.headingPath.some((heading) => headingFallbackPriority(heading) === 0);
}

function findDefaultFallbackSegments(segments: KnowledgeMemorySegment[]) {
  return orderFallbackSegments(segments)
    .filter(isPreferredFallbackSegment)
    .slice(0, KNOWLEDGE_MEMORY_MAX_SELECTED_SEGMENTS);
}

function buildBalancedFallbackContext(input: {
  content: string;
  maxChars: number;
  segments: KnowledgeMemorySegment[];
}) {
  const headingFallbackText = buildHeadingFallbackText(input.content);

  return buildSelectedContext({
    wholeMemoryChars: input.content.length,
    selectedSegments: input.segments,
    fallbackMode: "fallback",
    maxChars: input.maxChars,
    headingFallbackText,
    maxSegmentChars: maxCharsPerSelectedSegment({
      maxChars: input.maxChars,
      selectedSegmentCount: input.segments.length,
      shouldBalance: true,
      reservedChars: headingFallbackReservedChars(headingFallbackText, input.maxChars),
    }),
  });
}

function findGeneralFallbackSegments(
  general: KnowledgeMemorySegment,
  segments: KnowledgeMemorySegment[],
) {
  const remainingSegments = segments.filter((segment) => segment.id !== general.id);
  const preferredSegments = findDefaultFallbackSegments(remainingSegments);
  const supportingSegments =
    preferredSegments.length > 0 ? preferredSegments : orderFallbackSegments(remainingSegments);

  return [general, ...supportingSegments.slice(0, KNOWLEDGE_MEMORY_MAX_SELECTED_SEGMENTS - 1)];
}

export function selectKnowledgeMemoryContext(
  input: SelectKnowledgeMemoryContextInput,
  options: SelectKnowledgeMemoryContextOptions = {},
): SelectedKnowledgeMemoryContext {
  const content = normalizeKnowledgeMemoryForSelection(input.content);
  if (!content) {
    return buildEmptyContext(0, "empty");
  }

  const maxChars = Math.min(
    input.maxChars ?? KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
    content.length,
  );

  if (content.length <= KNOWLEDGE_MEMORY_SMALL_CONTENT_MAX_LENGTH && maxChars === content.length) {
    return buildWholeSmallContext(content);
  }

  const segments = parseMarkdownMemory(content);
  if (segments.length === 0) {
    return buildRawFallbackContext(content, maxChars);
  }

  const isDefaultRetriever = !options.retrieveSegments;
  // Computed once and reused for the default retriever's own scoring below, instead of letting
  // retrieveKnowledgeMemorySegmentsLexically recompute the same tokenize + spelling-variant
  // expansion internally right before this function needs the identical tokens again for excerpt
  // selection's queryTokens.
  const defaultQueryTokens = isDefaultRetriever
    ? buildKnowledgeMemoryQueryTokens(input)
    : undefined;
  const defaultInputLocales = isDefaultRetriever
    ? buildKnowledgeMemoryInputLocales(input)
    : undefined;
  const rankedSegments = options.retrieveSegments
    ? options.retrieveSegments({ segments, query: input })
    : retrieveKnowledgeMemorySegmentsLexicallyWithTokens(segments, input, defaultQueryTokens!);

  if (rankedSegments.length > 0) {
    const selectedSegments = selectRankedSegmentsForTargets(rankedSegments, input);

    return buildSelectedContext({
      wholeMemoryChars: content.length,
      selectedSegments,
      fallbackMode: "selective",
      maxChars,
      // Only the default lexical retriever's match reason is "these literal tokens", so only it
      // gets literal-token excerpting. A custom retriever may select a segment for a reason that
      // has nothing to do with token overlap (semantic similarity, a fixed heading, etc.); handing
      // it the raw query tokens anyway can make buildSegmentExcerpt center on some unrelated word
      // that happens to appear later in that segment, dropping the guidance the retriever actually
      // selected. Omitting queryTokens here falls back to the segment's own compactPromptText.
      queryTokens: defaultQueryTokens,
      inputLocales: defaultInputLocales,
      // shouldBalance: true unconditionally, not just for multi-locale requests — this call site
      // can select multiple independently-matched segments under a single target locale too (a
      // single query matching more than one Memory.md section). maxCharsPerSelectedSegment already
      // returns undefined for a single selected segment on its own, so this only starts dividing
      // the budget once there's actually more than one preview competing for it. Without this, an
      // early segment with many matched units could fill the entire outer maxChars on its own,
      // and appendWithinBudget's sequential loop would then reject every segment selected after it
      // instead of each one getting a bounded share.
      maxSegmentChars: maxCharsPerSelectedSegment({
        maxChars,
        selectedSegmentCount: selectedSegments.length,
        shouldBalance: true,
      }),
    });
  }

  const general = findGeneralFallback(segments);
  if (general) {
    const headingFallbackText = buildHeadingFallbackText(content);
    const selectedSegments = findGeneralFallbackSegments(general, segments);

    return buildSelectedContext({
      wholeMemoryChars: content.length,
      selectedSegments,
      fallbackMode: "general",
      maxChars,
      headingFallbackText,
      maxSegmentChars: maxCharsPerSelectedSegment({
        maxChars,
        selectedSegmentCount: selectedSegments.length,
        shouldBalance: true,
        reservedChars: headingFallbackReservedChars(headingFallbackText, maxChars),
      }),
    });
  }

  const fallbackSegments = findDefaultFallbackSegments(segments);
  if (fallbackSegments.length > 0) {
    return buildBalancedFallbackContext({
      content,
      maxChars,
      segments: fallbackSegments,
    });
  }

  return buildBalancedFallbackContext({
    content,
    maxChars,
    segments: orderFallbackSegments(segments).slice(0, KNOWLEDGE_MEMORY_MAX_SELECTED_SEGMENTS),
  });
}
