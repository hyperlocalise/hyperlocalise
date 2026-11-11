/**
 * Design context: link Figma text layers to the project's existing string keys, sync
 * frames to Hyperlocalise as CAT visual context, and preview translations in place.
 * Pure helpers live here so they can be tested without the Figma sandbox.
 */

/** Node plugin data: the project key this text layer shows. */
export const FIGMA_KEY_LINK_NAMESPACE = "hyperlocalise:key-link:v1";
/** Node plugin data: the canvas text before a translation preview replaced it. */
export const FIGMA_PREVIEW_SOURCE_NAMESPACE = "hyperlocalise:preview-source:v1";
/** Root plugin data: the Figma file link, shared with everyone who opens the file. */
export const FIGMA_FILE_LINK_NAMESPACE = "hyperlocalise:figma-file-link:v1";

/**
 * Vercel caps request bodies at 4.5 MB. Keep each frame's base64 image under 4 MB so
 * the JSON envelope fits.
 */
export const FRAME_IMAGE_MAX_BASE64_CHARS = 4_000_000;
/** Go-svc rejects images over 10,000 px a side; stay well inside it. */
export const FRAME_EXPORT_MAX_SIDE = 4_096;
const FIT_TOLERANCE_PX = 1;

export type FigmaKeyLink = {
  id: string;
  key: string;
  sourcePath: string | null;
  maxLength: number | null;
};

export type FigmaDesignKey = FigmaKeyLink & { sourceText: string };

export type DesignTextNode = {
  nodeId: string;
  text: string;
  layerName: string;
  frameId: string | null;
  frameName: string | null;
  link: FigmaKeyLink | null;
};

export type DesignMarker = { left: number; top: number; width: number; height: number };

export type DesignFrameExport = {
  nodeId: string;
  name: string;
  contentType: "image/png" | "image/jpeg";
  imageBase64: string;
  bindings: Array<{ translationKeyId: string; marker: DesignMarker | null }>;
};

export type Rect = { x: number; y: number; width: number; height: number };

export type TextFitIssue = {
  nodeId: string;
  keyId: string;
  key: string;
  /** The rendered text spills out of its box or a clipping frame. */
  overflow: boolean;
  /** The text is longer than the key's character limit. */
  overLimit: boolean;
  length: number;
  maxLength: number | null;
};

export function parseKeyLink(raw: string): FigmaKeyLink | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<FigmaKeyLink>;
    if (typeof parsed.id !== "string" || typeof parsed.key !== "string") {
      return null;
    }
    return {
      id: parsed.id,
      key: parsed.key,
      sourcePath: typeof parsed.sourcePath === "string" ? parsed.sourcePath : null,
      maxLength:
        typeof parsed.maxLength === "number" && parsed.maxLength > 0 ? parsed.maxLength : null,
    };
  } catch {
    return null;
  }
}

export function serializeKeyLink(link: FigmaKeyLink): string {
  return JSON.stringify({
    id: link.id,
    key: link.key,
    sourcePath: link.sourcePath,
    maxLength: link.maxLength,
  });
}

/** Reads the file key from a Figma file, design, prototype, or board link. */
export function parseFigmaFileLink(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || (host !== "figma.com" && !host.endsWith(".figma.com"))) {
    return null;
  }
  const match = /^\/(?:file|design|proto|board)\/([A-Za-z0-9]{10,128})(?:\/|$)/.exec(url.pathname);
  return match?.[1] ?? null;
}

function fileNameSlug(fileName: string) {
  const slug = fileName
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return encodeURIComponent(slug || "file");
}

/** A link that opens the file at one frame, for CAT and the key's design link. */
export function figmaDesignUrl(fileKey: string, fileName: string, nodeId: string): string {
  return `https://www.figma.com/design/${fileKey}/${fileNameSlug(fileName)}?node-id=${encodeURIComponent(
    nodeId.replace(/:/g, "-"),
  )}`;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

/** The text layer's box as percentages of its frame, clipped to the frame. */
export function markerForNode(frame: Rect, node: Rect): DesignMarker | null {
  if (frame.width <= 0 || frame.height <= 0) {
    return null;
  }
  const left = clampPercent(((node.x - frame.x) / frame.width) * 100);
  const top = clampPercent(((node.y - frame.y) / frame.height) * 100);
  const right = clampPercent(((node.x + node.width - frame.x) / frame.width) * 100);
  const bottom = clampPercent(((node.y + node.height - frame.y) / frame.height) * 100);
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) {
    return null;
  }
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const marker = { left: round(left), top: round(top), width: round(width), height: round(height) };
  // Rounding must not push the box past the frame edge.
  marker.width = Math.min(marker.width, round(100 - marker.left));
  marker.height = Math.min(marker.height, round(100 - marker.top));
  return marker.width > 0 && marker.height > 0 ? marker : null;
}

/** Export scale that keeps the longest side within the limit, never upscaling. */
export function frameExportScale(frame: { width: number; height: number }): number {
  const longest = Math.max(frame.width, frame.height);
  if (longest <= 0) {
    return 1;
  }
  return Math.min(1, FRAME_EXPORT_MAX_SIDE / longest);
}

export function base64Length(byteLength: number) {
  return Math.ceil(byteLength / 3) * 4;
}

const TEXT_BOX_FIXED = new Set(["NONE", "TRUNCATE"]);

/**
 * Whether the rendered text no longer fits. A fixed text box overflows when the render
 * bounds outgrow it; any text overflows when it spills outside the nearest clipping frame.
 */
export function detectTextOverflow(input: {
  textAutoResize: string;
  box: Rect | null;
  render: Rect | null;
  clip: Rect | null;
}): boolean {
  const { box, render, clip } = input;
  if (!render) {
    return false;
  }
  if (box && TEXT_BOX_FIXED.has(input.textAutoResize)) {
    if (
      render.width > box.width + FIT_TOLERANCE_PX ||
      render.height > box.height + FIT_TOLERANCE_PX
    ) {
      return true;
    }
  }
  if (clip) {
    if (
      render.x < clip.x - FIT_TOLERANCE_PX ||
      render.y < clip.y - FIT_TOLERANCE_PX ||
      render.x + render.width > clip.x + clip.width + FIT_TOLERANCE_PX ||
      render.y + render.height > clip.y + clip.height + FIT_TOLERANCE_PX
    ) {
      return true;
    }
  }
  return false;
}

/** Code points, matching how the platform counts a key's character limit. */
export function characterCount(text: string): number {
  return Array.from(text).length;
}

export function exceedsCharacterLimit(text: string, maxLength: number | null): boolean {
  return maxLength != null && maxLength > 0 && characterCount(text) > maxLength;
}

export type DesignMatchSummary = {
  linked: number;
  alreadyLinked: number;
  ambiguous: number;
  unmatched: number;
};

export type DesignKeyMatch = {
  nodeId: string;
  matchedBy: "key_name" | "source_text" | null;
  key: FigmaDesignKey | null;
  candidates: FigmaDesignKey[];
};

/**
 * New links from a match run. Layers someone already linked keep their link, so a re-run
 * never undoes a manual choice.
 */
export function planKeyLinks(
  nodes: DesignTextNode[],
  matches: DesignKeyMatch[],
): { links: Array<{ nodeId: string; link: FigmaKeyLink }>; summary: DesignMatchSummary } {
  const byNode = new Map(matches.map((match) => [match.nodeId, match]));
  const links: Array<{ nodeId: string; link: FigmaKeyLink }> = [];
  const summary: DesignMatchSummary = { linked: 0, alreadyLinked: 0, ambiguous: 0, unmatched: 0 };
  for (const node of nodes) {
    if (node.link) {
      summary.alreadyLinked += 1;
      continue;
    }
    const match = byNode.get(node.nodeId);
    if (match?.key) {
      links.push({
        nodeId: node.nodeId,
        link: {
          id: match.key.id,
          key: match.key.key,
          sourcePath: match.key.sourcePath,
          maxLength: match.key.maxLength,
        },
      });
      summary.linked += 1;
    } else if (match && match.candidates.length > 1) {
      summary.ambiguous += 1;
    } else {
      summary.unmatched += 1;
    }
  }
  return { links, summary };
}

export function matchSummaryMessage(summary: DesignMatchSummary): string {
  const parts = [`Linked ${summary.linked} new ${summary.linked === 1 ? "layer" : "layers"}`];
  if (summary.alreadyLinked > 0) {
    parts.push(`${summary.alreadyLinked} already linked`);
  }
  if (summary.ambiguous > 0) {
    parts.push(`${summary.ambiguous} with several matching keys`);
  }
  if (summary.unmatched > 0) {
    parts.push(`${summary.unmatched} with no matching key`);
  }
  return `${parts.join(", ")}.`;
}

export function previewSummaryMessage(input: {
  localeLabel: string;
  applied: number;
  missing: number;
  issues: TextFitIssue[];
}): { message: string; tone: "positive" | "warn" } {
  const overflow = input.issues.filter((issue) => issue.overflow).length;
  const overLimit = input.issues.filter((issue) => issue.overLimit).length;
  const parts = [`Previewing ${input.localeLabel} on ${input.applied} linked layers`];
  if (input.missing > 0) {
    parts.push(`${input.missing} not translated yet`);
  }
  if (overflow > 0) {
    parts.push(`${overflow} overflow ${overflow === 1 ? "its box" : "their boxes"}`);
  }
  if (overLimit > 0) {
    parts.push(`${overLimit} over the character limit`);
  }
  return {
    message: `${parts.join(", ")}.`,
    tone: overflow > 0 || overLimit > 0 ? "warn" : "positive",
  };
}
