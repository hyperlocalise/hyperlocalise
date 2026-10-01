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
import JSZip from "jszip";
import { describe, expect, it } from "vite-plus/test";

import { isErr } from "@/lib/primitives/result/results";

import {
  applyDotLottieTextTranslations,
  isDotLottieAnimationEntry,
  isDotLottieTextKey,
  readDotLottieAnimations,
  splitDotLottieCompositeKey,
} from "./dotlottie-archive";

const dotLottieAnimation = `{"v":"5.9.0","fr":24,"ip":0,"op":48,"layers":[{"ty":5,"nm":"Caption","t":{"d":{"k":[{"s":{"t":"Tap to start","s":20},"t":0}]}}}]}`;

async function buildDotLottieArchive(entries: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.file(name, content);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

describe("isDotLottieAnimationEntry", () => {
  it("accepts v1 and v2 animation JSON paths", () => {
    expect(isDotLottieAnimationEntry("a/caption.json")).toBe(true);
    expect(isDotLottieAnimationEntry("animations/promo.json")).toBe(true);
  });

  it("rejects directories, non-json, and non-animation paths", () => {
    expect(isDotLottieAnimationEntry("a/")).toBe(false);
    expect(isDotLottieAnimationEntry("a/caption.txt")).toBe(false);
    expect(isDotLottieAnimationEntry("manifest.json")).toBe(false);
    expect(isDotLottieAnimationEntry("i/hero.png")).toBe(false);
  });
});

describe("splitDotLottieCompositeKey", () => {
  it("splits on the final # so entry names may contain #", () => {
    expect(splitDotLottieCompositeKey("a/cap#tion.json#layers[0].t.d.k[0].s.t")).toEqual({
      entryName: "a/cap#tion.json",
      lottieKey: "layers[0].t.d.k[0].s.t",
    });
  });

  it("rejects keys without a usable separator", () => {
    expect(splitDotLottieCompositeKey("layers[0].t.d.k[0].s.t")).toBeNull();
    expect(splitDotLottieCompositeKey("#layers[0].t.d.k[0].s.t")).toBeNull();
    expect(splitDotLottieCompositeKey("a/caption.json#")).toBeNull();
  });
});

describe("isDotLottieTextKey", () => {
  it("requires an animation entry plus a Lottie text path", () => {
    expect(isDotLottieTextKey("a/caption.json#layers[0].t.d.k[0].s.t")).toBe(true);
    expect(isDotLottieTextKey("animations/promo.json#assets[0].layers[1].t.d.k[0].s.t")).toBe(true);
    expect(isDotLottieTextKey("manifest.json#layers[0].t.d.k[0].s.t")).toBe(false);
    expect(isDotLottieTextKey("a/caption.json#greeting.title")).toBe(false);
  });
});

describe("readDotLottieAnimations", () => {
  it("reads animation entries from a dotLottie archive", async () => {
    const archive = await buildDotLottieArchive({
      "manifest.json": "{}",
      "a/caption.json": dotLottieAnimation,
    });

    const result = await readDotLottieAnimations(archive);
    expect(isErr(result)).toBe(false);
    if (isErr(result)) {
      return;
    }
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.entryName).toBe("a/caption.json");
  });

  it("reads v1 animations/ entries and skips invalid animation JSON", async () => {
    const archive = await buildDotLottieArchive({
      "manifest.json": "{}",
      "animations/valid.json": dotLottieAnimation,
      "animations/broken.json": '{"not":"lottie"}',
    });

    const result = await readDotLottieAnimations(archive);
    expect(isErr(result)).toBe(false);
    if (isErr(result)) {
      return;
    }
    expect(result.value.map((entry) => entry.entryName)).toEqual(["animations/valid.json"]);
  });

  it("returns no_animations when the archive has no valid animation JSON", async () => {
    const archive = await buildDotLottieArchive({
      "manifest.json": "{}",
      "a/broken.json": '{"not":"lottie"}',
    });
    const result = await readDotLottieAnimations(archive);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      return;
    }
    expect(result.error.code).toBe("no_animations");
  });

  it("returns invalid_archive for non-zip bytes", async () => {
    const result = await readDotLottieAnimations(new TextEncoder().encode("not-a-zip"));
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      return;
    }
    expect(result.error.code).toBe("invalid_archive");
  });
});

describe("applyDotLottieTextTranslations", () => {
  it("rewrites matching animation text and preserves unrelated entries", async () => {
    const archive = await buildDotLottieArchive({
      "manifest.json": '{"version":"2"}',
      "a/caption.json": dotLottieAnimation,
      "a/other.json": `{"v":"5.9.0","fr":24,"ip":0,"op":48,"layers":[{"ty":5,"nm":"Other","t":{"d":{"k":[{"s":{"t":"Keep me","s":20},"t":0}]}}}]}`,
      "i/hero.png": "image-bytes",
    });

    const result = await applyDotLottieTextTranslations(archive, {
      "a/caption.json#layers[0].t.d.k[0].s.t": "Comenzar",
      "not-a-composite": "ignored",
    });
    expect(isErr(result)).toBe(false);
    if (isErr(result)) {
      return;
    }

    const zip = await JSZip.loadAsync(result.value);
    expect(
      JSON.parse(await zip.file("a/caption.json")!.async("string")).layers[0].t.d.k[0].s.t,
    ).toBe("Comenzar");
    expect(JSON.parse(await zip.file("a/other.json")!.async("string")).layers[0].t.d.k[0].s.t).toBe(
      "Keep me",
    );
    expect(await zip.file("manifest.json")!.async("string")).toBe('{"version":"2"}');
    expect(await zip.file("i/hero.png")!.async("string")).toBe("image-bytes");
  });

  it("returns no_animations when applying translations to an empty archive", async () => {
    const archive = await buildDotLottieArchive({ "manifest.json": "{}" });
    const result = await applyDotLottieTextTranslations(archive, {
      "a/caption.json#layers[0].t.d.k[0].s.t": "Comenzar",
    });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      return;
    }
    expect(result.error.code).toBe("no_animations");
  });
});
