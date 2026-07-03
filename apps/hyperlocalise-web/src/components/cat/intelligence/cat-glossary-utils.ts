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
