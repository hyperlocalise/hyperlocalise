import type {
  KnowledgeMemorySegment,
  KnowledgeMemorySegmentKind,
} from "./knowledge-memory-selection.types";

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

const rootHeading = "Memory.md";
const maxParentPreviewChars = 500;
const maxNeighbourChars = 320;

export function normalizeKnowledgeMemoryForSelection(content: string) {
  return content.replace(/\r\n?/g, "\n").trim();
}

function headingKey(path: string[]) {
  return path.join("\u001f");
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
  return (
    heading.level === 1 &&
    stackLength === 0 &&
    heading.text.toLowerCase() === rootHeading.toLowerCase()
  );
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

  const ranges = new Map<string, string>();
  for (const [pathKey, sectionLines] of sections.entries()) {
    ranges.set(pathKey, sectionLines.join("\n").trim());
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
  const normalized = normalizeKnowledgeMemoryForSelection(content);
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
    const parentText = sections.get(headingKey(draft.headingPath)) ?? "";
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
