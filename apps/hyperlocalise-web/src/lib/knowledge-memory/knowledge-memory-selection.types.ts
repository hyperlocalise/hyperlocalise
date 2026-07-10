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
  | "fallback"
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

export type RankedKnowledgeMemorySegment = {
  segment: KnowledgeMemorySegment;
  score: number;
};

export type KnowledgeMemoryRetrieverInput = {
  segments: KnowledgeMemorySegment[];
  query: SelectKnowledgeMemoryContextInput;
};

export type KnowledgeMemoryRetriever = (
  input: KnowledgeMemoryRetrieverInput,
) => RankedKnowledgeMemorySegment[];
