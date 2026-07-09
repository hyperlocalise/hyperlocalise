export function getKnowledgeMemoryPreviewState(input: {
  targetLocale: string;
  sourceText: string;
  isPreviewing: boolean;
}) {
  const hasQuery = input.targetLocale.trim().length > 0 || input.sourceText.trim().length > 0;

  return {
    hasQuery,
    canPreview: hasQuery && !input.isPreviewing,
  };
}

export function formatMemoryReductionPercent(value: number) {
  return `${Math.max(0, value).toFixed(0)}% smaller`;
}
