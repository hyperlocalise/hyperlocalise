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
import { inferSupportedTranslationFileFormat } from "@/lib/translation/file-formats";
import { isErr } from "@/lib/primitives/result/results";

import {
  inlineDotLottieImages,
  readDotLottieAnimations,
  splitDotLottieCompositeKey,
} from "./dotlottie-archive";
import {
  applyLottieTextTranslations,
  isLottieTextKey,
  parseLottieJson,
  type LottiePayload,
} from "./lottie-document";

export function lottiePreviewValuesFingerprint(values: Readonly<Record<string, string>>): string {
  return JSON.stringify(Object.entries(values).toSorted(([a], [b]) => a.localeCompare(b)));
}

export function buildLottiePreviewValuesFromSegments(
  segments: ReadonlyArray<{ key: string; sourceText: string; targetText: string }>,
  mode: "source" | "target",
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const segment of segments) {
    if (mode === "source") {
      values[segment.key] = segment.sourceText;
      continue;
    }
    values[segment.key] = segment.targetText.trim() ? segment.targetText : segment.sourceText;
  }
  return values;
}

export function extractDotLottieEntryValues(
  values: Readonly<Record<string, string>>,
  entryName: string,
): Record<string, string> {
  const entryValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    const parts = splitDotLottieCompositeKey(key);
    if (parts?.entryName === entryName) {
      entryValues[parts.lottieKey] = value;
    }
  }
  return entryValues;
}

function resolveDotLottieEntryName(
  animations: Array<{ entryName: string }>,
  activeSegmentKey?: string | null,
): string {
  if (activeSegmentKey) {
    const parts = splitDotLottieCompositeKey(activeSegmentKey);
    if (parts && animations.some((animation) => animation.entryName === parts.entryName)) {
      return parts.entryName;
    }
  }
  return animations[0]!.entryName;
}

export type LottiePreviewBase =
  | {
      kind: "json";
      payload: LottiePayload;
    }
  | {
      kind: "dotlottie";
      entryName: string;
      payload: LottiePayload;
    };

export async function fetchLottieSourceBytes(sourceUrl: string): Promise<ArrayBuffer | null> {
  const response = await fetch(sourceUrl, { credentials: "include" });
  if (!response.ok) {
    return null;
  }
  return response.arrayBuffer();
}

export async function loadLottiePreviewBase(input: {
  sourceBytes: ArrayBuffer;
  sourcePath: string;
  activeSegmentKey?: string | null;
}): Promise<LottiePreviewBase | null> {
  const format = inferSupportedTranslationFileFormat(input.sourcePath);
  if (format === "lottie") {
    const animations = await readDotLottieAnimations(input.sourceBytes);
    if (isErr(animations) || animations.value.length === 0) {
      return null;
    }

    const entryName = resolveDotLottieEntryName(animations.value, input.activeSegmentKey);
    const animation =
      animations.value.find((candidate) => candidate.entryName === entryName) ??
      animations.value[0]!;
    const inlined = await inlineDotLottieImages(input.sourceBytes, animation.payload);
    if (isErr(inlined)) {
      return null;
    }

    return {
      kind: "dotlottie",
      entryName: animation.entryName,
      payload: inlined.value,
    };
  }

  const text = new TextDecoder().decode(input.sourceBytes);
  const payload = parseLottieJson(text);
  if (!payload) {
    return null;
  }

  return {
    kind: "json",
    payload,
  };
}

export function applyLottiePreviewValues(
  base: LottiePreviewBase,
  values: Readonly<Record<string, string>>,
): LottiePayload {
  if (base.kind === "dotlottie") {
    const entryValues = extractDotLottieEntryValues(values, base.entryName);
    return applyLottieTextTranslations(base.payload, entryValues);
  }

  const jsonValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (isLottieTextKey(key)) {
      jsonValues[key] = value;
    }
  }
  return applyLottieTextTranslations(base.payload, jsonValues);
}

export async function loadLottiePreviewPayload(input: {
  sourceUrl: string;
  sourcePath: string;
  values: Readonly<Record<string, string>>;
  activeSegmentKey?: string | null;
}): Promise<LottiePayload | null> {
  const sourceBytes = await fetchLottieSourceBytes(input.sourceUrl);
  if (!sourceBytes) {
    return null;
  }

  const base = await loadLottiePreviewBase({
    sourceBytes,
    sourcePath: input.sourcePath,
    activeSegmentKey: input.activeSegmentKey,
  });
  if (!base) {
    return null;
  }

  return applyLottiePreviewValues(base, input.values);
}
