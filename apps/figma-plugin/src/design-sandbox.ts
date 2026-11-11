import {
  base64Length,
  characterCount,
  detectTextOverflow,
  exceedsCharacterLimit,
  FIGMA_FILE_LINK_NAMESPACE,
  FIGMA_KEY_LINK_NAMESPACE,
  FIGMA_PREVIEW_SOURCE_NAMESPACE,
  FRAME_IMAGE_MAX_BASE64_CHARS,
  frameExportScale,
  markerForNode,
  parseFigmaFileLink,
  parseKeyLink,
  serializeKeyLink,
  type DesignFrameExport,
  type DesignTextNode,
  type FigmaKeyLink,
  type Rect,
  type TextFitIssue,
} from "./design-context";
import { loadFontsForTextNodes } from "./load-text-node-fonts";

/** Figma sandbox side of design context. Runs only inside `code.ts`. */

const FRAME_TYPES = new Set(["FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE", "GROUP"]);
const JPEG_FALLBACK_SCALES = [1, 0.75, 0.5, 0.35];

type FrameLike = FrameNode | ComponentNode | ComponentSetNode | InstanceNode | GroupNode;

export function readKeyLink(node: TextNode): FigmaKeyLink | null {
  return parseKeyLink(node.getPluginData(FIGMA_KEY_LINK_NAMESPACE));
}

/** Canvas text, or the text a translation preview replaced, so previews never become source. */
export function sourceTextOf(node: TextNode): string {
  return node.getPluginData(FIGMA_PREVIEW_SOURCE_NAMESPACE) || node.characters;
}

/** Called after Apply writes a node, so a later Restore does not undo it. */
export function clearPreviewSource(node: TextNode) {
  node.setPluginData(FIGMA_PREVIEW_SOURCE_NAMESPACE, "");
}

/** The top-level frame (on the page or in a section) that holds the node. */
function designFrameFor(node: SceneNode): FrameLike | null {
  let current: BaseNode = node;
  while (current.parent && current.parent.type !== "PAGE" && current.parent.type !== "SECTION") {
    current = current.parent;
  }
  if (current === node || !FRAME_TYPES.has(current.type)) {
    return null;
  }
  return current as FrameLike;
}

function toDesignTextNode(node: TextNode): DesignTextNode {
  const frame = designFrameFor(node);
  return {
    nodeId: node.id,
    text: sourceTextOf(node),
    layerName: node.name,
    frameId: frame?.id ?? null,
    frameName: frame?.name ?? null,
    link: readKeyLink(node),
  };
}

function textNodesIn(nodes: readonly SceneNode[]): TextNode[] {
  return nodes.flatMap((node) => {
    if (node.type === "TEXT") {
      return [node];
    }
    if ("findAll" in node) {
      return node.findAll((child) => child.type === "TEXT") as TextNode[];
    }
    return [];
  });
}

function allTextNodes(page: PageNode): TextNode[] {
  return page.findAll((node) => node.type === "TEXT") as TextNode[];
}

function nonEmpty(nodes: TextNode[]) {
  return nodes.filter((node) => sourceTextOf(node).trim().length > 0);
}

export function scanDesignText(page: PageNode, selectionOnly: boolean): DesignTextNode[] {
  const selected = selectionOnly ? textNodesIn(page.selection) : [];
  const nodes = selected.length > 0 ? selected : allTextNodes(page);
  return nonEmpty(nodes).map(toDesignTextNode);
}

export function readSelectedDesignText(page: PageNode): DesignTextNode[] {
  return nonEmpty(textNodesIn(page.selection)).map(toDesignTextNode);
}

export function readFileLink(): string | null {
  return figma.root.getPluginData(FIGMA_FILE_LINK_NAMESPACE) || null;
}

export function saveFileLink(url: string) {
  const trimmed = url.trim();
  if (trimmed && !parseFigmaFileLink(trimmed)) {
    throw new Error("Paste a figma.com file link, for example https://www.figma.com/design/…");
  }
  figma.root.setPluginData(FIGMA_FILE_LINK_NAMESPACE, trimmed);
}

export async function writeKeyLinks(
  links: Array<{ nodeId: string; link: FigmaKeyLink | null }>,
): Promise<number> {
  let count = 0;
  for (const entry of links) {
    const node = await figma.getNodeByIdAsync(entry.nodeId);
    if (node?.type !== "TEXT") {
      continue;
    }
    node.setPluginData(FIGMA_KEY_LINK_NAMESPACE, entry.link ? serializeKeyLink(entry.link) : "");
    count += 1;
  }
  return count;
}

function rectOf(node: { absoluteBoundingBox: Rect | null }): Rect | null {
  return node.absoluteBoundingBox;
}

/** Frames on the page that contain linked text, with a marker per linked key. */
export function collectDesignFrames(page: PageNode): {
  frames: Array<Omit<DesignFrameExport, "contentType" | "imageBase64">>;
  unframed: number;
} {
  const byFrame = new Map<
    string,
    {
      frame: FrameLike;
      bindings: Map<string, DesignFrameExport["bindings"][number]>;
    }
  >();
  let unframed = 0;
  for (const node of allTextNodes(page)) {
    const link = readKeyLink(node);
    if (!link) {
      continue;
    }
    const frame = designFrameFor(node);
    if (!frame) {
      unframed += 1;
      continue;
    }
    let entry = byFrame.get(frame.id);
    if (!entry) {
      entry = { frame, bindings: new Map() };
      byFrame.set(frame.id, entry);
    }
    // A key shown twice in a frame keeps its first marker; CAT stores one per frame.
    if (entry.bindings.has(link.id)) {
      continue;
    }
    const frameBox = rectOf(frame);
    const nodeBox = rectOf(node);
    entry.bindings.set(link.id, {
      translationKeyId: link.id,
      marker: frameBox && nodeBox ? markerForNode(frameBox, nodeBox) : null,
    });
  }
  return {
    frames: [...byFrame.values()].map(({ frame, bindings }) => ({
      nodeId: frame.id,
      name: frame.name,
      bindings: [...bindings.values()],
    })),
    unframed,
  };
}

/** PNG when it fits the upload limit; otherwise JPEG at shrinking scales. */
export async function exportDesignFrame(
  frame: Omit<DesignFrameExport, "contentType" | "imageBase64">,
): Promise<DesignFrameExport> {
  const node = await figma.getNodeByIdAsync(frame.nodeId);
  if (!node || !("exportAsync" in node) || !FRAME_TYPES.has(node.type)) {
    throw new Error(`Frame “${frame.name}” is no longer in this file.`);
  }
  const sceneNode = node as FrameLike;
  const baseScale = frameExportScale({ width: sceneNode.width, height: sceneNode.height });
  const png = await sceneNode.exportAsync({
    format: "PNG",
    useAbsoluteBounds: true,
    constraint: { type: "SCALE", value: baseScale },
  });
  if (base64Length(png.byteLength) <= FRAME_IMAGE_MAX_BASE64_CHARS) {
    return { ...frame, contentType: "image/png", imageBase64: figma.base64Encode(png) };
  }
  for (const factor of JPEG_FALLBACK_SCALES) {
    const jpeg = await sceneNode.exportAsync({
      format: "JPG",
      useAbsoluteBounds: true,
      constraint: { type: "SCALE", value: baseScale * factor },
    });
    if (base64Length(jpeg.byteLength) <= FRAME_IMAGE_MAX_BASE64_CHARS) {
      return { ...frame, contentType: "image/jpeg", imageBase64: figma.base64Encode(jpeg) };
    }
  }
  throw new Error(`Frame “${frame.name}” is too large to sync. Split it into smaller frames.`);
}

function clippingAncestorBox(node: SceneNode): Rect | null {
  let parent = node.parent;
  while (parent && parent.type !== "PAGE" && parent.type !== "DOCUMENT") {
    if ("clipsContent" in parent && parent.clipsContent && "absoluteBoundingBox" in parent) {
      return parent.absoluteBoundingBox;
    }
    parent = parent.parent;
  }
  return null;
}

function fitIssueFor(node: TextNode, link: FigmaKeyLink): TextFitIssue | null {
  const overflow = detectTextOverflow({
    textAutoResize: node.textAutoResize,
    box: node.absoluteBoundingBox,
    render: node.absoluteRenderBounds,
    clip: clippingAncestorBox(node),
  });
  const overLimit = exceedsCharacterLimit(node.characters, link.maxLength);
  if (!overflow && !overLimit) {
    return null;
  }
  return {
    nodeId: node.id,
    keyId: link.id,
    key: link.key,
    overflow,
    overLimit,
    length: characterCount(node.characters),
    maxLength: link.maxLength,
  };
}

/**
 * Writes one locale onto linked layers so designers can check length and layout. The
 * original text is kept in plugin data until Restore. Keys without a translation show
 * their original text, so an earlier preview language never lingers.
 */
export async function previewTranslations(
  page: PageNode,
  translations: Array<{ keyId: string; text: string | null }>,
): Promise<{ applied: number; missing: number; issues: TextFitIssue[] }> {
  const byKey = new Map(translations.map((entry) => [entry.keyId, entry.text]));
  const updates: Array<{ node: TextNode; link: FigmaKeyLink; next: string; translated: boolean }> =
    [];
  for (const node of allTextNodes(page)) {
    const link = readKeyLink(node);
    if (!link || !byKey.has(link.id)) {
      continue;
    }
    const translated = byKey.get(link.id);
    const source = sourceTextOf(node);
    updates.push({
      node,
      link,
      next: translated && translated.trim() ? translated : source,
      translated: Boolean(translated && translated.trim()),
    });
  }
  await loadFontsForTextNodes(updates.map((entry) => entry.node));

  let applied = 0;
  let missing = 0;
  const issues: TextFitIssue[] = [];
  for (const { node, link, next, translated } of updates) {
    if (!node.getPluginData(FIGMA_PREVIEW_SOURCE_NAMESPACE)) {
      node.setPluginData(FIGMA_PREVIEW_SOURCE_NAMESPACE, node.characters);
    }
    if (node.characters !== next) {
      node.characters = next;
    }
    if (!translated) {
      missing += 1;
      continue;
    }
    applied += 1;
    const issue = fitIssueFor(node, link);
    if (issue) {
      issues.push(issue);
    }
  }
  return { applied, missing, issues };
}

export async function restorePreviewSource(page: PageNode): Promise<number> {
  const nodes = allTextNodes(page).filter((node) =>
    Boolean(node.getPluginData(FIGMA_PREVIEW_SOURCE_NAMESPACE)),
  );
  await loadFontsForTextNodes(nodes);
  for (const node of nodes) {
    const source = node.getPluginData(FIGMA_PREVIEW_SOURCE_NAMESPACE);
    if (node.characters !== source) {
      node.characters = source;
    }
    clearPreviewSource(node);
  }
  return nodes.length;
}

export async function selectNodes(nodeIds: string[]): Promise<number> {
  const nodes: SceneNode[] = [];
  for (const id of nodeIds) {
    const node = await figma.getNodeByIdAsync(id);
    if (node && "visible" in node) {
      nodes.push(node as SceneNode);
    }
  }
  if (nodes.length > 0) {
    figma.currentPage.selection = nodes;
    figma.viewport.scrollAndZoomIntoView(nodes);
  }
  return nodes.length;
}
