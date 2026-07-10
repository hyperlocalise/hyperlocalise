import {
  KNOWLEDGE_MEMORY_MAX_SELECTED_SEGMENTS,
  KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
  KNOWLEDGE_MEMORY_SMALL_CONTENT_MAX_LENGTH,
} from "./knowledge-memory.shared";
import {
  normalizeKnowledgeMemoryForSelection,
  parseMarkdownMemory,
} from "./knowledge-memory-markdown-parser";
import { retrieveKnowledgeMemorySegmentsLexically } from "./knowledge-memory-lexical-retriever";
import type {
  KnowledgeMemoryFallbackMode,
  KnowledgeMemoryRetriever,
  KnowledgeMemorySegment,
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

function buildSelectedContext(input: {
  wholeMemoryChars: number;
  selectedSegments: KnowledgeMemorySegment[];
  fallbackMode: KnowledgeMemoryFallbackMode;
  maxChars: number;
}) {
  const lines: string[] = [];
  const segments: SelectedKnowledgeMemorySegment[] = [];

  for (const segment of input.selectedSegments) {
    if (!appendWithinBudget(lines, segment.compactPromptText, input.maxChars)) {
      break;
    }
    segments.push({
      id: segment.id,
      headingPath: segment.headingPath,
      startLine: segment.startLine,
      endLine: segment.endLine,
      preview: segment.compactPromptText,
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

function truncateFallbackText(content: string, maxChars: number) {
  return content.length > maxChars
    ? `${content.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`
    : content;
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
  const headings = content
    .split("\n")
    .map((line) => {
      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.trim());
      if (!match) {
        return null;
      }
      return {
        level: match[1]?.length ?? 1,
        text: match[2]?.trim() ?? "",
      };
    })
    .filter((heading): heading is { level: number; text: string } => Boolean(heading?.text));

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

function buildFallbackText(content: string, maxChars: number, segments: KnowledgeMemorySegment[]) {
  const headingBudget = Math.min(maxChars, 1_200);
  const lines = [truncateFallbackText(buildHeadingFallbackText(content), headingBudget)];
  const fallbackSegments = orderFallbackSegments(segments).slice(
    0,
    KNOWLEDGE_MEMORY_MAX_SELECTED_SEGMENTS,
  );

  for (const segment of fallbackSegments) {
    if (!appendWithinBudget(lines, segment.compactPromptText, maxChars)) {
      break;
    }
  }

  return lines.join("\n");
}

function buildRawFallbackContext(
  content: string,
  maxChars: number,
  segments: KnowledgeMemorySegment[] = [],
): SelectedKnowledgeMemoryContext {
  const fallbackText =
    segments.length > 0
      ? buildFallbackText(content, maxChars, segments)
      : buildHeadingFallbackText(content);
  const compactText = truncateFallbackText(fallbackText, maxChars);

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

function findGeneralFallbackSegments(
  general: KnowledgeMemorySegment,
  segments: KnowledgeMemorySegment[],
) {
  const remainingSegments = segments.filter((segment) => segment.id !== general.id);
  const preferredSegments = findDefaultFallbackSegments(remainingSegments);
  const supportingSegments =
    preferredSegments.length > 0 ? preferredSegments : orderFallbackSegments(remainingSegments);

  return [general, ...supportingSegments].slice(0, KNOWLEDGE_MEMORY_MAX_SELECTED_SEGMENTS);
}

export function selectKnowledgeMemoryContext(
  input: SelectKnowledgeMemoryContextInput,
  options: SelectKnowledgeMemoryContextOptions = {},
): SelectedKnowledgeMemoryContext {
  const content = normalizeKnowledgeMemoryForSelection(input.content);
  if (!content) {
    return buildEmptyContext(0, "empty");
  }

  if (content.length <= KNOWLEDGE_MEMORY_SMALL_CONTENT_MAX_LENGTH) {
    return buildWholeSmallContext(content);
  }

  const maxChars = input.maxChars ?? KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH;
  const segments = parseMarkdownMemory(content);
  if (segments.length === 0) {
    return buildRawFallbackContext(content, maxChars);
  }

  const retrieveSegments = options.retrieveSegments ?? retrieveKnowledgeMemorySegmentsLexically;
  const rankedSegments = retrieveSegments({
    segments,
    query: input,
  });

  if (rankedSegments.length > 0) {
    return buildSelectedContext({
      wholeMemoryChars: content.length,
      selectedSegments: rankedSegments
        .slice(0, KNOWLEDGE_MEMORY_MAX_SELECTED_SEGMENTS)
        .map((item) => item.segment),
      fallbackMode: "selective",
      maxChars,
    });
  }

  const general = findGeneralFallback(segments);
  if (general) {
    return buildSelectedContext({
      wholeMemoryChars: content.length,
      selectedSegments: findGeneralFallbackSegments(general, segments),
      fallbackMode: "general",
      maxChars,
    });
  }

  const fallbackSegments = findDefaultFallbackSegments(segments);
  if (fallbackSegments.length > 0) {
    return buildSelectedContext({
      wholeMemoryChars: content.length,
      selectedSegments: fallbackSegments,
      fallbackMode: "fallback",
      maxChars,
    });
  }

  return buildRawFallbackContext(content, maxChars, segments);
}
