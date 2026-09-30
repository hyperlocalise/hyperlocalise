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
  DOTLOTTIE_CONTENT_TYPE,
  LOTTIE_JSON_CONTENT_TYPE,
  buildLottieTranslationExport,
  resolveLottieSourceKind,
} from "./lottie-translation-export";

const lottieAnimation = {
  v: "5.9.0",
  fr: 24,
  ip: 0,
  op: 48,
  layers: [
    {
      ty: 5,
      nm: "Caption",
      t: { d: { k: [{ s: { t: "Tap to start", s: 20 }, t: 0 }] } },
    },
  ],
};

async function buildDotLottieArchive(entries: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.file(name, content);
  }
  return Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}

describe("resolveLottieSourceKind", () => {
  it("treats .lottie paths as dotLottie regardless of keys", () => {
    expect(resolveLottieSourceKind("promo.lottie", [])).toBe("dotlottie");
    expect(resolveLottieSourceKind("promo.lottie", ["greeting.title"])).toBe("dotlottie");
  });

  it("treats JSON as Lottie only when every key is a Lottie text path", () => {
    expect(resolveLottieSourceKind("promo.json", ["layers[0].t.d.k[0].s.t"])).toBe("json");
    expect(
      resolveLottieSourceKind("promo.json", [
        "layers[0].t.d.k[0].s.t",
        "assets[0].layers[1].t.d.k[0].s.t",
      ]),
    ).toBe("json");
  });

  it("rejects empty key lists and mixed JSON catalogs", () => {
    expect(resolveLottieSourceKind("promo.json", [])).toBeNull();
    expect(
      resolveLottieSourceKind("promo.json", ["layers[0].t.d.k[0].s.t", "greeting.title"]),
    ).toBeNull();
    expect(resolveLottieSourceKind("promo.po", ["layers[0].t.d.k[0].s.t"])).toBeNull();
  });
});

describe("buildLottieTranslationExport", () => {
  it("exports translated Lottie JSON", async () => {
    const result = await buildLottieTranslationExport({
      kind: "json",
      sourceContent: Buffer.from(JSON.stringify(lottieAnimation), "utf8"),
      values: { "layers[0].t.d.k[0].s.t": "Appuyez pour commencer" },
    });

    expect(isErr(result)).toBe(false);
    if (isErr(result)) {
      return;
    }
    expect(result.value.kind).toBe("json");
    expect(result.value.contentType).toBe(LOTTIE_JSON_CONTENT_TYPE);
    expect(JSON.parse(result.value.content.toString("utf8")).layers[0].t.d.k[0].s.t).toBe(
      "Appuyez pour commencer",
    );
  });

  it("rejects non-Lottie JSON sources", async () => {
    const result = await buildLottieTranslationExport({
      kind: "json",
      sourceContent: Buffer.from('{"greeting":"hi"}', "utf8"),
      values: {},
    });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      return;
    }
    expect(result.error.code).toBe("source_not_lottie");
  });

  it("rewrites only translated animations inside a dotLottie archive", async () => {
    const source = await buildDotLottieArchive({
      "manifest.json": '{"version":"2"}',
      "a/caption.json": JSON.stringify(lottieAnimation),
      "a/other.json": JSON.stringify({
        ...lottieAnimation,
        layers: [
          {
            ty: 5,
            nm: "Other",
            t: { d: { k: [{ s: { t: "Keep me", s: 20 }, t: 0 }] } },
          },
        ],
      }),
      "i/hero.png": "not-a-real-png",
    });

    const result = await buildLottieTranslationExport({
      kind: "dotlottie",
      sourceContent: source,
      values: {
        "a/caption.json#layers[0].t.d.k[0].s.t": "Comenzar",
        "ignored-key": "nope",
      },
    });

    expect(isErr(result)).toBe(false);
    if (isErr(result)) {
      return;
    }
    expect(result.value.kind).toBe("dotlottie");
    expect(result.value.contentType).toBe(DOTLOTTIE_CONTENT_TYPE);

    const zip = await JSZip.loadAsync(result.value.content);
    const fileNames = Object.values(zip.files)
      .filter((file) => !file.dir)
      .map((file) => file.name)
      .sort();
    expect(fileNames).toEqual(["a/caption.json", "a/other.json", "i/hero.png", "manifest.json"]);
    expect(
      JSON.parse(await zip.file("a/caption.json")!.async("string")).layers[0].t.d.k[0].s.t,
    ).toBe("Comenzar");
    expect(JSON.parse(await zip.file("a/other.json")!.async("string")).layers[0].t.d.k[0].s.t).toBe(
      "Keep me",
    );
    expect(await zip.file("manifest.json")!.async("string")).toBe('{"version":"2"}');
    expect(await zip.file("i/hero.png")!.async("string")).toBe("not-a-real-png");
  });

  it("maps invalid archives to invalid_dotlottie_archive", async () => {
    const result = await buildLottieTranslationExport({
      kind: "dotlottie",
      sourceContent: Buffer.from("not-a-zip"),
      values: {},
    });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      return;
    }
    expect(result.error.code).toBe("invalid_dotlottie_archive");
  });
});
