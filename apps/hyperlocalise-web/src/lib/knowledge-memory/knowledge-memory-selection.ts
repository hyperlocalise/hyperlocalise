import {
  KNOWLEDGE_MEMORY_MAX_SELECTED_SEGMENTS,
  KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
  KNOWLEDGE_MEMORY_SMALL_CONTENT_MAX_LENGTH,
} from "./knowledge-memory.shared";

export type KnowledgeMemorySegmentKind = "paragraph" | "bullet_group";

export type KnowledgeMemorySegment = {
  id: string;
  kind: KnowledgeMemorySegmentKind;
  headingPath: string[];
  segmentText: string;
  parentSectionPreview: string | null;
  previousNeighbourText: string | null;
  nextNeighbourText: string | null;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  searchText: string;
  compactPromptText: string;
};

export type KnowledgeMemoryFallbackMode =
  | "empty"
  | "whole_small"
  | "selective"
  | "general"
  | "none";

export type SelectedKnowledgeMemorySegment = Pick<
  KnowledgeMemorySegment,
  "id" | "headingPath" | "startLine" | "endLine"
> & {
  preview: string;
};

export type SelectedKnowledgeMemoryMetrics = {
  selectedMemoryCount: number;
  selectedMemoryChars: number;
  wholeMemoryChars: number;
  reductionPercent: number;
  matchedHeadingPaths: string[];
  fallbackMode: KnowledgeMemoryFallbackMode;
};

export type SelectedKnowledgeMemoryContext = {
  compactText: string;
  segments: SelectedKnowledgeMemorySegment[];
  metrics: SelectedKnowledgeMemoryMetrics;
};

export type SelectKnowledgeMemoryContextInput = {
  content: string;
  targetLocale?: string | null;
  targetLocales?: string[];
  sourceLocale?: string | null;
  sourceText?: string | null;
  context?: string | null;
  key?: string | null;
  path?: string | null;
  metadata?: Record<string, string | undefined | null>;
  projectName?: string | null;
  projectTranslationContext?: string | null;
  maxChars?: number;
};

type LineRecord = {
  text: string;
  lineNumber: number;
  startOffset: number;
  endOffset: number;
};

type SegmentDraft = Omit<
  KnowledgeMemorySegment,
  | "parentSectionPreview"
  | "previousNeighbourText"
  | "nextNeighbourText"
  | "searchText"
  | "compactPromptText"
>;

type SectionRange = {
  pathKey: string;
  text: string;
};

const rootHeading = "Memory.md";
const maxParentPreviewChars = 500;
const maxNeighbourChars = 320;
const minSelectiveScore = 3;
const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "be",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "not",
  "of",
  "or",
  "the",
  "to",
  "using",
  "with",
  "your",
]);
const tokenVariantMap: Record<string, string[]> = {
  color: ["colour"],
  colors: ["colours"],
  colorful: ["colourful"],
  colored: ["coloured"],
  customize: ["customise"],
  customized: ["customised"],
  customizes: ["customises"],
  customizing: ["customising"],
  localize: ["localise"],
  localized: ["localised"],
  localizes: ["localises"],
  localizing: ["localising"],
  localization: ["localisation"],
  organize: ["organise"],
  organized: ["organised"],
  organizes: ["organises"],
  organizing: ["organising"],
};

for (const [token, variants] of Object.entries(tokenVariantMap)) {
  for (const variant of variants) {
    tokenVariantMap[variant] = [...(tokenVariantMap[variant] ?? []), token];
  }
}

function headingKey(path: string[]) {
  return path.join("\u001f");
}

function normalizeContentForSelection(content: string) {
  return content.replace(/\r\n?/g, "\n").trim();
}

function toLineRecords(content: string): LineRecord[] {
  const lines = content.split("\n");
  let offset = 0;
  return lines.map((text, index) => {
    const startOffset = offset;
    const hasTrailingNewline = index < lines.length - 1;
    const endOffset = startOffset + text.length + (hasTrailingNewline ? 1 : 0);
    offset = endOffset;
    return {
      text,
      lineNumber: index + 1,
      startOffset,
      endOffset,
    };
  });
}

function parseHeading(line: string): { level: number; text: string } | null {
  const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.trim());
  if (!match) {
    return null;
  }

  return {
    level: match[1]?.length ?? 1,
    text: match[2]?.trim() ?? "",
  };
}

function isDocumentRootHeading(heading: { level: number; text: string }, stackLength: number) {
  return heading.level === 1 && stackLength === 0 && heading.text.toLowerCase() === "memory.md";
}

function isBulletLine(line: string) {
  return /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
}

function previewText(text: string, maxChars: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function normalizeBulletText(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, ""))
    .filter(Boolean)
    .join("; ");
}

function segmentPreviewText(text: string) {
  return previewText(normalizeBulletText(text), 900);
}

function buildSectionRanges(content: string, lines: LineRecord[]) {
  const stack: Array<{ level: number; text: string }> = [];
  const sections = new Map<string, string[]>();

  for (const line of lines) {
    const heading = parseHeading(line.text);
    if (heading) {
      if (isDocumentRootHeading(heading, stack.length)) {
        continue;
      }

      while (stack.length > 0 && stack[stack.length - 1]!.level >= heading.level) {
        stack.pop();
      }
      stack.push(heading);
      const key = headingKey([rootHeading, ...stack.map((item) => item.text)]);
      if (!sections.has(key)) {
        sections.set(key, []);
      }
      continue;
    }

    const path = [rootHeading, ...stack.map((item) => item.text)];
    const key = headingKey(path);
    if (!sections.has(key)) {
      sections.set(key, []);
    }
    sections.get(key)!.push(line.text);
  }

  if (sections.size === 0 && content.trim()) {
    sections.set(headingKey([rootHeading]), [content]);
  }

  const ranges = new Map<string, SectionRange>();
  for (const [pathKey, sectionLines] of sections.entries()) {
    ranges.set(pathKey, {
      pathKey,
      text: sectionLines.join("\n").trim(),
    });
  }

  return ranges;
}

function buildSearchText(input: {
  headingPath: string[];
  segmentText: string;
  parentSectionPreview: string | null;
  previousNeighbourText: string | null;
  nextNeighbourText: string | null;
}) {
  return [
    input.headingPath.join(" > "),
    input.parentSectionPreview,
    input.previousNeighbourText,
    input.segmentText,
    input.nextNeighbourText,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCompactPromptText(input: {
  headingPath: string[];
  segmentText: string;
  previousNeighbourText: string | null;
  nextNeighbourText: string | null;
}) {
  const expanded = [input.previousNeighbourText, input.segmentText, input.nextNeighbourText]
    .filter(Boolean)
    .join("\n");

  return `${input.headingPath.join(" > ")} -> ${segmentPreviewText(expanded)}`;
}

export function parseMarkdownMemory(content: string): KnowledgeMemorySegment[] {
  const normalized = normalizeContentForSelection(content);
  if (!normalized) {
    return [];
  }

  const lines = toLineRecords(normalized);
  const sections = buildSectionRanges(normalized, lines);
  const stack: Array<{ level: number; text: string }> = [];
  const drafts: SegmentDraft[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    const heading = parseHeading(line.text);
    if (heading) {
      if (isDocumentRootHeading(heading, stack.length)) {
        index += 1;
        continue;
      }

      while (stack.length > 0 && stack[stack.length - 1]!.level >= heading.level) {
        stack.pop();
      }
      stack.push(heading);
      index += 1;
      continue;
    }

    if (!line.text.trim()) {
      index += 1;
      continue;
    }

    const kind: KnowledgeMemorySegmentKind = isBulletLine(line.text) ? "bullet_group" : "paragraph";
    const block: LineRecord[] = [];

    while (index < lines.length) {
      const current = lines[index]!;
      if (!current.text.trim() || parseHeading(current.text)) {
        break;
      }

      if (kind === "bullet_group" && !isBulletLine(current.text)) {
        break;
      }

      if (kind === "paragraph" && isBulletLine(current.text)) {
        break;
      }

      block.push(current);
      index += 1;
    }

    const headingPath = [rootHeading, ...stack.map((item) => item.text)];
    const start = block[0]!;
    const end = block[block.length - 1]!;

    drafts.push({
      id: `memory-segment-${drafts.length + 1}`,
      kind,
      headingPath,
      segmentText: block
        .map((item) => item.text)
        .join("\n")
        .trim(),
      startLine: start.lineNumber,
      endLine: end.lineNumber,
      startOffset: start.startOffset,
      endOffset: end.endOffset,
    });
  }

  return drafts.map((draft, draftIndex) => {
    const previous = drafts[draftIndex - 1];
    const next = drafts[draftIndex + 1];
    const parentText = sections.get(headingKey(draft.headingPath))?.text ?? "";
    const previousNeighbourText =
      previous && headingKey(previous.headingPath) === headingKey(draft.headingPath)
        ? previewText(previous.segmentText, maxNeighbourChars)
        : null;
    const nextNeighbourText =
      next && headingKey(next.headingPath) === headingKey(draft.headingPath)
        ? previewText(next.segmentText, maxNeighbourChars)
        : null;
    const parentSectionPreview = parentText ? previewText(parentText, maxParentPreviewChars) : null;

    const segment = {
      ...draft,
      parentSectionPreview,
      previousNeighbourText,
      nextNeighbourText,
      searchText: "",
      compactPromptText: "",
    };

    segment.searchText = buildSearchText(segment);
    segment.compactPromptText = buildCompactPromptText(segment);
    return segment;
  });
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/\u2019/g, "")
    .split(/[^\p{L}\p{N}-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function expandTokens(tokens: string[]) {
  const expanded = new Set<string>();
  for (const token of tokens) {
    expanded.add(token);
    for (const variant of tokenVariantMap[token] ?? []) {
      expanded.add(variant);
    }
  }
  return expanded;
}

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function buildQueryParts(input: SelectKnowledgeMemoryContextInput) {
  const metadata = Object.values(input.metadata ?? {}).filter(Boolean) as string[];
  return uniqueValues([
    input.targetLocale ?? null,
    ...(input.targetLocales ?? []),
    input.sourceLocale ?? null,
    input.sourceText ?? null,
    input.context ?? null,
    input.key ?? null,
    input.path ?? null,
    input.projectName ?? null,
    input.projectTranslationContext ?? null,
    ...metadata,
  ]);
}

function scoreSegment(segment: KnowledgeMemorySegment, queryParts: string[]) {
  const queryTokens = expandTokens(tokenize(queryParts.join(" ")));
  if (queryTokens.size === 0) {
    return 0;
  }

  const headingTokens = expandTokens(tokenize(segment.headingPath.join(" ")));
  const searchTokens = expandTokens(tokenize(segment.searchText));
  let score = 0;

  for (const token of queryTokens) {
    if (headingTokens.has(token)) {
      score += 4;
    }
    if (searchTokens.has(token)) {
      score += 3;
    }
  }

  for (const locale of uniqueValues([inputLocaleFromParts(queryParts)])) {
    const normalizedLocale = locale.toLowerCase();
    const headingText = segment.headingPath.join(" ").toLowerCase();
    if (headingText.includes(normalizedLocale)) {
      score += 12;
    }
  }

  return score;
}

function inputLocaleFromParts(queryParts: string[]) {
  return queryParts.find((part) => /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})?$/i.test(part)) ?? null;
}

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

function findGeneralFallback(segments: KnowledgeMemorySegment[]) {
  return segments.find((segment) =>
    segment.headingPath.some((heading) => /^(general|overview|summary)$/i.test(heading.trim())),
  );
}

export function selectKnowledgeMemoryContext(
  input: SelectKnowledgeMemoryContextInput,
): SelectedKnowledgeMemoryContext {
  const content = normalizeContentForSelection(input.content);
  if (!content) {
    return buildEmptyContext(0, "empty");
  }

  if (content.length <= KNOWLEDGE_MEMORY_SMALL_CONTENT_MAX_LENGTH) {
    return buildWholeSmallContext(content);
  }

  const maxChars = input.maxChars ?? KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH;
  const segments = parseMarkdownMemory(content);
  if (segments.length === 0) {
    return buildEmptyContext(content.length, "none");
  }

  const queryParts = buildQueryParts(input);
  const scored = segments
    .map((segment) => ({
      segment,
      score: scoreSegment(segment, queryParts),
    }))
    .filter((item) => item.score >= minSelectiveScore)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.segment.startOffset - b.segment.startOffset;
    });

  if (scored.length > 0) {
    return buildSelectedContext({
      wholeMemoryChars: content.length,
      selectedSegments: scored
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
      selectedSegments: [general],
      fallbackMode: "general",
      maxChars,
    });
  }

  return buildEmptyContext(content.length, "none");
}
