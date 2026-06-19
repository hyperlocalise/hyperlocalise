import type { CatQueueSummary, CatSegmentStatus } from "./types";

export function adjustQueueSummaryForStatusChange(
  summary: CatQueueSummary,
  previousStatus: CatSegmentStatus,
  nextStatus: CatSegmentStatus,
): CatQueueSummary {
  if (previousStatus === nextStatus) {
    return summary;
  }

  const next = { ...summary };

  const adjust = (key: keyof Omit<CatQueueSummary, "total">, delta: -1 | 1) => {
    const value = next[key] + delta;
    next[key] = Math.max(0, value);
  };

  const applyStatus = (status: CatSegmentStatus, delta: -1 | 1) => {
    switch (status) {
      case "reviewed":
        adjust("reviewed", delta);
        break;
      case "pending":
        adjust("untranslated", delta);
        break;
      case "needs_review":
        adjust("needsReview", delta);
        break;
      default:
        break;
    }
  };

  applyStatus(previousStatus, -1);
  applyStatus(nextStatus, 1);

  return next;
}

export function applyGlossaryTermToTarget(
  segmentSourceText: string,
  currentTargetText: string,
  term: { source: string; target: string; approved: boolean; forbidden: boolean },
): string {
  if (!term.approved || term.forbidden) {
    return currentTargetText;
  }

  if (currentTargetText.trim()) {
    if (currentTargetText.includes(term.source)) {
      return currentTargetText.replaceAll(term.source, term.target);
    }

    return currentTargetText;
  }

  if (segmentSourceText.includes(term.source)) {
    return segmentSourceText.replaceAll(term.source, term.target);
  }

  return term.target;
}
