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
import { describe, expect, it } from "vite-plus/test";

import {
  applyLottieTextTranslations,
  isLottiePayload,
  isLottieTextKey,
  listLottieTextEntries,
  parseLottieJson,
  type LottiePayload,
} from "./lottie-document";

function textLayer(text: string, layerType = 5) {
  return {
    ty: layerType,
    nm: "Caption",
    t: { d: { k: [{ s: { t: text, s: 20 }, t: 0 }] } },
  };
}

function samplePayload(overrides: Partial<LottiePayload> = {}): LottiePayload {
  return {
    v: "5.9.0",
    fr: 24,
    ip: 0,
    op: 48,
    layers: [textLayer("Hello")],
    ...overrides,
  };
}

describe("isLottiePayload", () => {
  it("accepts a versioned animation with frame bounds and layers", () => {
    expect(isLottiePayload(samplePayload())).toBe(true);
  });

  it("rejects non-objects, blank versions, missing layers, and non-numeric bounds", () => {
    expect(isLottiePayload(null)).toBe(false);
    expect(isLottiePayload([])).toBe(false);
    expect(isLottiePayload(samplePayload({ v: "   " }))).toBe(false);
    expect(isLottiePayload({ v: "5.9.0", fr: 24, ip: 0, op: 48 })).toBe(false);
    expect(isLottiePayload(samplePayload({ fr: "24" as unknown as number }))).toBe(false);
  });
});

describe("parseLottieJson", () => {
  it("parses valid Lottie JSON", () => {
    const payload = parseLottieJson(JSON.stringify(samplePayload()));
    expect(payload?.v).toBe("5.9.0");
    expect(payload?.layers).toHaveLength(1);
  });

  it("rejects JSON without a layers key and invalid payloads", () => {
    expect(parseLottieJson('{"v":"5.9.0","fr":24,"ip":0,"op":48}')).toBeNull();
    expect(parseLottieJson('{"layers":[],"v":"","fr":24,"ip":0,"op":48}')).toBeNull();
    expect(parseLottieJson("{not-json")).toBeNull();
  });
});

describe("isLottieTextKey", () => {
  it("accepts root and asset precomp text keys", () => {
    expect(isLottieTextKey("layers[1].t.d.k[0].s.t")).toBe(true);
    expect(isLottieTextKey("assets[3].layers[2].t.d.k[1].s.t")).toBe(true);
  });

  it("rejects plain JSON catalog keys and malformed Lottie paths", () => {
    expect(isLottieTextKey("greeting.title")).toBe(false);
    expect(isLottieTextKey("layers[1].nm")).toBe(false);
    expect(isLottieTextKey("assets.layers[0].t.d.k[0].s.t")).toBe(false);
  });
});

describe("listLottieTextEntries", () => {
  it("lists root text layers and precomp asset text, skipping blank and non-text layers", () => {
    const payload = samplePayload({
      layers: [textLayer("Hello"), textLayer("   "), textLayer("Shape", 4)],
      assets: [
        {
          id: "comp_0",
          layers: [textLayer("Nested")],
        },
        { id: "img_0", p: "hero.png" },
      ],
    });

    expect(listLottieTextEntries(payload)).toEqual([
      { key: "layers[0].t.d.k[0].s.t", text: "Hello" },
      { key: "assets[0].layers[0].t.d.k[0].s.t", text: "Nested" },
    ]);
  });
});

describe("applyLottieTextTranslations", () => {
  it("updates matching text without mutating the source payload", () => {
    const source = samplePayload({
      layers: [textLayer("Hello")],
      assets: [{ id: "comp_0", layers: [textLayer("Nested")] }],
    });

    const translated = applyLottieTextTranslations(source, {
      "layers[0].t.d.k[0].s.t": "Bonjour",
      "assets[0].layers[0].t.d.k[0].s.t": "Imbriqué",
      "layers[9].t.d.k[0].s.t": "ignored-missing",
      "layers[0].t.d.k[0].s.t ": "ignored-whitespace-key",
    });

    expect(listLottieTextEntries(source)).toEqual([
      { key: "layers[0].t.d.k[0].s.t", text: "Hello" },
      { key: "assets[0].layers[0].t.d.k[0].s.t", text: "Nested" },
    ]);
    expect(listLottieTextEntries(translated)).toEqual([
      { key: "layers[0].t.d.k[0].s.t", text: "Bonjour" },
      { key: "assets[0].layers[0].t.d.k[0].s.t", text: "Imbriqué" },
    ]);
  });

  it("keeps source text when the translation is blank", () => {
    const source = samplePayload();
    const translated = applyLottieTextTranslations(source, {
      "layers[0].t.d.k[0].s.t": "   ",
    });
    expect(listLottieTextEntries(translated)).toEqual([
      { key: "layers[0].t.d.k[0].s.t", text: "Hello" },
    ]);
  });
});
