import type {
  CatFormatCheck,
  CatSegmentIntelligence,
  CatWorkspaceState,
} from "@/components/cat/shared/types";

export function withoutSaveFailureChecks(checks: CatFormatCheck[]) {
  return checks.filter((check) => !check.id.startsWith("save-failed-"));
}

export function hasSaveFailureCheck(checks: CatFormatCheck[]) {
  return checks.some((check) => check.id.startsWith("save-failed-"));
}

export function addSaveFailureFormatCheck(
  state: CatWorkspaceState,
  segmentId: string,
  message: string,
  label: string,
): Pick<CatWorkspaceState, "formatChecks" | "segmentFormatChecks"> {
  const saveFailureCheck: CatFormatCheck = {
    id: `save-failed-${segmentId}`,
    label,
    status: "fail",
    message,
    category: "qa",
  };
  const segmentChecks = state.segmentFormatChecks?.[segmentId] ?? state.formatChecks;

  return {
    formatChecks: [saveFailureCheck, ...withoutSaveFailureChecks(state.formatChecks)],
    segmentFormatChecks: {
      ...state.segmentFormatChecks,
      [segmentId]: [saveFailureCheck, ...withoutSaveFailureChecks(segmentChecks)],
    },
  };
}

export function getAiSuggestionForSegment(
  state: Pick<CatWorkspaceState, "intelligence" | "segmentIntelligence">,
  segmentId: string,
) {
  return state.segmentIntelligence?.[segmentId]?.aiSuggestion ?? state.intelligence.aiSuggestion;
}

export function resolveSegmentIntelligenceForDisplay(
  state: Pick<CatWorkspaceState, "intelligence" | "segmentIntelligence">,
  segmentId: string,
): CatSegmentIntelligence {
  const segmentIntelligence = state.segmentIntelligence?.[segmentId];
  if (!segmentIntelligence) {
    return state.intelligence;
  }

  return {
    ...segmentIntelligence,
    aiSuggestion: getAiSuggestionForSegment(state, segmentId),
    aiReasoning: segmentIntelligence.aiReasoning ?? state.intelligence.aiReasoning,
  };
}

export function collectSegmentsWithAgentContext(
  state: Pick<CatWorkspaceState, "segmentIntelligence">,
): ReadonlySet<string> {
  return new Set(
    Object.entries(state.segmentIntelligence ?? {})
      .filter(([, intelligence]) => Boolean(intelligence.agentContext?.trim()))
      .map(([segmentId]) => segmentId),
  );
}

export function glossaryTermsForSegment(
  state: Pick<CatWorkspaceState, "intelligence" | "segmentIntelligence">,
  segmentId: string,
) {
  return (
    state.segmentIntelligence?.[segmentId]?.glossaryTerms ?? state.intelligence.glossaryTerms ?? []
  );
}

export function mergeSegmentIntelligenceOnHydrate(input: {
  nextInitialState: CatWorkspaceState;
  currentState: Pick<CatWorkspaceState, "intelligence" | "segmentIntelligence">;
  segmentId: string;
  existing: CatSegmentIntelligence | undefined;
}): CatSegmentIntelligence | undefined {
  const { nextInitialState, currentState, segmentId, existing } = input;
  const nextConcordance = nextInitialState.segmentIntelligence?.[segmentId];
  const currentConcordance = currentState.segmentIntelligence?.[segmentId];
  const nextAgentContext = nextConcordance?.agentContext;
  const currentAgentContext = currentConcordance?.agentContext;
  const nextVisualContext = nextConcordance?.visualContext;
  const currentVisualContext = currentConcordance?.visualContext;

  let merged = existing ?? nextConcordance;

  if (!nextAgentContext?.trim() && currentAgentContext?.trim()) {
    merged = {
      ...(merged ?? nextInitialState.intelligence),
      ...currentConcordance,
      agentContext: currentAgentContext,
    };
  }

  const hasCurrentConcordance =
    (currentConcordance?.glossaryTerms.length ?? 0) > 0 ||
    (currentConcordance?.translationMemoryMatches?.length ?? 0) > 0;
  const hasNextConcordance =
    (nextConcordance?.glossaryTerms.length ?? 0) > 0 ||
    (nextConcordance?.translationMemoryMatches?.length ?? 0) > 0;

  if (hasCurrentConcordance && !hasNextConcordance) {
    merged = {
      ...(merged ?? nextInitialState.intelligence),
      ...currentConcordance,
      glossaryTerms: currentConcordance?.glossaryTerms ?? [],
      translationMemoryMatches: currentConcordance?.translationMemoryMatches,
    };
  }

  if (!nextVisualContext && currentVisualContext) {
    merged = {
      ...(merged ?? nextInitialState.intelligence),
      ...currentConcordance,
      visualContext: currentVisualContext,
    };
  }

  return merged;
}
