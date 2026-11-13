import type { FigmaSegment } from "./plugin-messages";

export const FIGMA_SEGMENT_PLUGIN_NAMESPACE = "hyperlocalise:segment:v1";
export const FIGMA_SEGMENT_KEY_PREFIX = "figma.k.";

function fillRandomBytes(bytes: Uint8Array<ArrayBuffer>) {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    webCrypto.getRandomValues(bytes);
    return;
  }
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
}

function randomSegmentUlid(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let id = "";
  const bytes = new Uint8Array(new ArrayBuffer(16));
  fillRandomBytes(bytes);
  for (let i = 0; i < 26; i += 1) {
    id += alphabet[bytes[i % bytes.length]! % 32];
  }
  return id;
}

export function mintFigmaSegmentKey(): string {
  return `${FIGMA_SEGMENT_KEY_PREFIX}${randomSegmentUlid()}`;
}

export function readStampedSegmentKey(node: TextNode): string | null {
  const raw = node.getPluginData(FIGMA_SEGMENT_PLUGIN_NAMESPACE);
  if (!raw || typeof raw !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { key?: string };
    if (typeof parsed.key === "string" && parsed.key.startsWith(FIGMA_SEGMENT_KEY_PREFIX)) {
      return parsed.key;
    }
  } catch {
    return null;
  }
  return null;
}

export function writeStampedSegmentKey(node: TextNode, key: string) {
  node.setPluginData(FIGMA_SEGMENT_PLUGIN_NAMESPACE, JSON.stringify({ key }));
}

export function createFigmaSegment(input: {
  node: TextNode;
  regionIndex: number;
  text: string;
}): FigmaSegment {
  const existing = readStampedSegmentKey(input.node);
  const key = existing ?? mintFigmaSegmentKey();
  if (!existing) {
    writeStampedSegmentKey(input.node, key);
  }
  return {
    key,
    nodeId: input.node.id,
    regionIndex: input.regionIndex,
    text: input.text,
  };
}
