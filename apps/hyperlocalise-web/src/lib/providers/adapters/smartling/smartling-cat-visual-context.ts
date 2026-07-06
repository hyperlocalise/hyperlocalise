import {
  pixelRectToPercentMarkers,
  type CatVisualContext,
  type CatVisualContextScreenshot,
} from "@/lib/translation/cat-visual-context";

import type { SmartlingApiClient, SmartlingContextBinding } from "./smartling-api";

const maxSmartlingScreenshotsPerSegment = 8;

export async function loadSmartlingCatVisualContext(input: {
  client: SmartlingApiClient;
  externalProjectId: string;
  externalStringId: string;
}): Promise<CatVisualContext> {
  const hashcode = input.externalStringId.trim();
  if (!hashcode) {
    return { screenshots: [] };
  }

  const { items: bindings } = await input.client.listContextBindings(input.externalProjectId, {
    stringHashcodes: [hashcode],
  });
  const matchingBindings = bindings.filter((binding) => binding.stringHashcode === hashcode);
  if (matchingBindings.length === 0) {
    return { screenshots: [] };
  }

  const bindingsByContext = groupBindingsByContext(matchingBindings);
  const screenshots: CatVisualContextScreenshot[] = [];

  for (const [contextUid, contextBindings] of bindingsByContext) {
    if (screenshots.length >= maxSmartlingScreenshotsPerSegment) {
      break;
    }

    let contextInfo;
    try {
      contextInfo = await input.client.getContextInfo(input.externalProjectId, contextUid);
    } catch {
      continue;
    }

    if (contextInfo.contextType !== "IMAGE") {
      continue;
    }

    let content;
    try {
      content = await input.client.downloadContextContent(input.externalProjectId, contextUid);
    } catch {
      continue;
    }

    const dimensions = readImageDimensions(content.bytes);
    const markers = contextBindings
      .map((binding) => mapBindingMarker(binding, dimensions))
      .filter((marker): marker is NonNullable<typeof marker> => marker != null);

    screenshots.push({
      id: contextUid,
      name: contextInfo.name,
      imageUrl: toDataUrl(content.bytes, content.contentType),
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      markers,
    });
  }

  return { screenshots };
}

function groupBindingsByContext(bindings: SmartlingContextBinding[]) {
  const grouped = new Map<string, SmartlingContextBinding[]>();
  for (const binding of bindings) {
    const existing = grouped.get(binding.contextUid) ?? [];
    existing.push(binding);
    grouped.set(binding.contextUid, existing);
  }
  return grouped;
}

function mapBindingMarker(
  binding: SmartlingContextBinding,
  dimensions: { width: number; height: number } | null,
) {
  const coordinates = binding.coordinates;
  if (!coordinates || coordinates.width <= 0 || coordinates.height <= 0) {
    return null;
  }

  if (dimensions) {
    return pixelRectToPercentMarkers({
      width: dimensions.width,
      height: dimensions.height,
      left: coordinates.left,
      top: coordinates.top,
      widthPx: coordinates.width,
      heightPx: coordinates.height,
    });
  }

  return null;
}

export function readImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  }

  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      width: view.getUint16(6, true),
      height: view.getUint16(8, true),
    };
  }

  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return readJpegDimensions(bytes);
  }

  return null;
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }

    const segmentLength = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (segmentLength < 2) {
      return null;
    }

    const isStartOfFrame =
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb ||
      marker === 0xcd ||
      marker === 0xce ||
      marker === 0xcf;

    if (isStartOfFrame && offset + 7 < bytes.length) {
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
      };
    }

    offset += segmentLength + 2;
  }

  return null;
}

function toDataUrl(bytes: Uint8Array, contentType: string) {
  const normalizedType = contentType.trim() || "image/png";
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${normalizedType};base64,${base64}`;
}
