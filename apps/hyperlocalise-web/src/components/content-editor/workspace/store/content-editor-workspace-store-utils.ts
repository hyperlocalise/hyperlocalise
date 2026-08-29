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
import type {
  ContentEditorFormatCheck,
  ContentEditorSegmentIntelligence,
  ContentEditorWorkspaceState,
} from "@/components/content-editor/shared/types";

export function withoutSaveFailureChecks(checks: ContentEditorFormatCheck[]) {
  return checks.filter((check) => !check.id.startsWith("save-failed-"));
}

export function hasSaveFailureCheck(checks: ContentEditorFormatCheck[]) {
  return checks.some((check) => check.id.startsWith("save-failed-"));
}

export function addSaveFailureFormatCheck(
  state: ContentEditorWorkspaceState,
  segmentId: string,
  message: string,
  label: string,
): Pick<ContentEditorWorkspaceState, "formatChecks" | "segmentFormatChecks"> {
  const saveFailureCheck: ContentEditorFormatCheck = {
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
  state: Pick<ContentEditorWorkspaceState, "intelligence" | "segmentIntelligence">,
  segmentId: string,
) {
  return state.segmentIntelligence?.[segmentId]?.aiSuggestion ?? state.intelligence.aiSuggestion;
}

export function resolveSegmentIntelligenceForDisplay(
  state: Pick<ContentEditorWorkspaceState, "intelligence" | "segmentIntelligence">,
  segmentId: string,
): ContentEditorSegmentIntelligence {
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
  state: Pick<ContentEditorWorkspaceState, "segmentIntelligence">,
): ReadonlySet<string> {
  return new Set(
    Object.entries(state.segmentIntelligence ?? {})
      .filter(([, intelligence]) => Boolean(intelligence.agentContext?.trim()))
      .map(([segmentId]) => segmentId),
  );
}

export function glossaryTermsForSegment(
  state: Pick<ContentEditorWorkspaceState, "intelligence" | "segmentIntelligence">,
  segmentId: string,
) {
  return (
    state.segmentIntelligence?.[segmentId]?.glossaryTerms ?? state.intelligence.glossaryTerms ?? []
  );
}

export function mergeSegmentIntelligenceOnHydrate(input: {
  nextInitialState: ContentEditorWorkspaceState;
  currentState: Pick<ContentEditorWorkspaceState, "intelligence" | "segmentIntelligence">;
  segmentId: string;
  existing: ContentEditorSegmentIntelligence | undefined;
}): ContentEditorSegmentIntelligence | undefined {
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
    (currentConcordance?.glossaryConcepts?.length ?? 0) > 0 ||
    (currentConcordance?.translationMemoryMatches?.length ?? 0) > 0;
  const hasNextConcordance =
    (nextConcordance?.glossaryTerms.length ?? 0) > 0 ||
    (nextConcordance?.glossaryConcepts?.length ?? 0) > 0 ||
    (nextConcordance?.translationMemoryMatches?.length ?? 0) > 0;

  if (hasCurrentConcordance && !hasNextConcordance) {
    merged = {
      ...(merged ?? nextInitialState.intelligence),
      ...currentConcordance,
      glossaryTerms: currentConcordance?.glossaryTerms ?? [],
      glossaryConcepts: currentConcordance?.glossaryConcepts,
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
