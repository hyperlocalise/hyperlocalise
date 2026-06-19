import type { CatSegment, CatWorkspaceState } from "./types";

export type SavedTargetTextMap = Record<string, string>;

export function buildSavedTargetTextMap(segments: CatSegment[]): SavedTargetTextMap {
  return Object.fromEntries(segments.map((segment) => [segment.id, segment.targetText]));
}

export function isSegmentTargetDirty(
  segmentId: string,
  targetText: string,
  savedTargetTexts: SavedTargetTextMap,
): boolean {
  const savedTargetText = savedTargetTexts[segmentId];
  if (savedTargetText === undefined) {
    return false;
  }

  return targetText !== savedTargetText;
}

export function collectDirtySegmentIds(
  segments: CatSegment[],
  savedTargetTexts: SavedTargetTextMap,
): string[] {
  return segments
    .filter((segment) => isSegmentTargetDirty(segment.id, segment.targetText, savedTargetTexts))
    .map((segment) => segment.id);
}

function getSegmentsById(state: CatWorkspaceState) {
  return new Map(state.segments.map((segment) => [segment.id, segment]));
}

export function syncSavedTargetTexts(input: {
  savedTargetTexts: SavedTargetTextMap;
  previousInitialState: CatWorkspaceState;
  currentState: CatWorkspaceState;
  nextInitialState: CatWorkspaceState;
}): SavedTargetTextMap {
  const previousSegments = getSegmentsById(input.previousInitialState);
  const currentSegments = getSegmentsById(input.currentState);
  const nextSavedTargetTexts = { ...input.savedTargetTexts };

  for (const nextSegment of input.nextInitialState.segments) {
    const previousSegment = previousSegments.get(nextSegment.id);
    const currentSegment = currentSegments.get(nextSegment.id);

    if (!previousSegment || !currentSegment) {
      nextSavedTargetTexts[nextSegment.id] = nextSegment.targetText;
      continue;
    }

    if (currentSegment.targetText !== previousSegment.targetText) {
      if (nextSavedTargetTexts[nextSegment.id] === undefined) {
        nextSavedTargetTexts[nextSegment.id] = previousSegment.targetText;
      }
      continue;
    }

    nextSavedTargetTexts[nextSegment.id] = nextSegment.targetText;
  }

  return nextSavedTargetTexts;
}

export function markSegmentTargetSaved(
  savedTargetTexts: SavedTargetTextMap,
  segmentId: string,
  targetText: string,
): SavedTargetTextMap {
  return {
    ...savedTargetTexts,
    [segmentId]: targetText,
  };
}
