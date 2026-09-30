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
import { isErr } from "@/lib/primitives/result/results";
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";

const LOTTIE_TEXT_LAYER_TYPE = 5;
const LOTTIE_REQUIRED_NUMBER_FIELDS = ["fr", "ip", "op"] as const;

/** Keys emitted by the CLI Lottie parser, e.g. `layers[1].t.d.k[0].s.t`. */
const LOTTIE_TEXT_KEY_PATTERN = /^(?:layers|assets\[\d+\]\.layers)\[\d+\]\.t\.d\.k\[\d+\]\.s\.t$/;

export type LottiePayload = Record<string, unknown> & { layers: unknown[] };

type LottieTextSlot = {
  key: string;
  document: Record<string, unknown>;
  text: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Mirrors the CLI check: a version string, frame rate, in/out points, and a layers array. */
export function isLottiePayload(value: unknown): value is LottiePayload {
  const payload = asRecord(value);
  if (!payload) {
    return false;
  }
  if (typeof payload.v !== "string" || !payload.v.trim()) {
    return false;
  }
  if (!Array.isArray(payload.layers)) {
    return false;
  }
  return LOTTIE_REQUIRED_NUMBER_FIELDS.every((field) => typeof payload[field] === "number");
}

export function parseLottieJson(text: string): LottiePayload | null {
  if (!text.includes('"layers"')) {
    return null;
  }
  const parsed = safeJsonParse(text);
  if (isErr(parsed) || !isLottiePayload(parsed.value)) {
    return null;
  }
  return parsed.value;
}

export function isLottieTextKey(key: string): boolean {
  return LOTTIE_TEXT_KEY_PATTERN.test(key);
}

function collectLayerTextSlots(slots: LottieTextSlot[], prefix: string, layers: unknown[]): void {
  layers.forEach((rawLayer, layerIndex) => {
    const layer = asRecord(rawLayer);
    if (!layer || layer.ty !== LOTTIE_TEXT_LAYER_TYPE) {
      return;
    }
    const keyframes = asRecord(asRecord(layer.t)?.d)?.k;
    if (!Array.isArray(keyframes)) {
      return;
    }
    keyframes.forEach((rawKeyframe, keyframeIndex) => {
      const document = asRecord(asRecord(rawKeyframe)?.s);
      const text = document?.t;
      if (!document || typeof text !== "string" || !text.trim()) {
        return;
      }
      slots.push({
        key: `${prefix}[${layerIndex}].t.d.k[${keyframeIndex}].s.t`,
        document,
        text,
      });
    });
  });
}

function collectLottieTextSlots(payload: LottiePayload): LottieTextSlot[] {
  const slots: LottieTextSlot[] = [];
  collectLayerTextSlots(slots, "layers", payload.layers);

  const assets = Array.isArray(payload.assets) ? payload.assets : [];
  assets.forEach((rawAsset, assetIndex) => {
    const layers = asRecord(rawAsset)?.layers;
    if (Array.isArray(layers)) {
      collectLayerTextSlots(slots, `assets[${assetIndex}].layers`, layers);
    }
  });
  return slots;
}

export function listLottieTextEntries(
  payload: LottiePayload,
): Array<{ key: string; text: string }> {
  return collectLottieTextSlots(payload).map(({ key, text }) => ({ key, text }));
}

/** Returns a copy of the animation with translated text; untranslated keys keep the source text. */
export function applyLottieTextTranslations(
  payload: LottiePayload,
  values: Readonly<Record<string, string>>,
): LottiePayload {
  const copy = structuredClone(payload);
  for (const slot of collectLottieTextSlots(copy)) {
    const translated = values[slot.key];
    if (typeof translated === "string" && translated.trim()) {
      slot.document.t = translated;
    }
  }
  return copy;
}
