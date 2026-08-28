import type { FigmaSegment } from "./plugin-messages";

export const FIGMA_SEGMENT_KEY_PREFIX = "figma.segment.";

export function figmaSegmentKey(nodeId: string, regionIndex: number): string {
  return `${FIGMA_SEGMENT_KEY_PREFIX}${nodeId}.${regionIndex}`;
}

export function createFigmaSegment(input: {
  nodeId: string;
  regionIndex: number;
  text: string;
}): FigmaSegment {
  return {
    key: figmaSegmentKey(input.nodeId, input.regionIndex),
    nodeId: input.nodeId,
    regionIndex: input.regionIndex,
    text: input.text,
  };
}
