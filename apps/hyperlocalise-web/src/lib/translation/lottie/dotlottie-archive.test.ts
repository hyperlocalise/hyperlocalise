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

import { readDotLottieAnimations } from "./dotlottie-archive";

const dotLottieAnimation = `{"v":"5.9.0","fr":24,"ip":0,"op":48,"layers":[{"ty":5,"nm":"Caption","t":{"d":{"k":[{"s":{"t":"Tap to start","s":20},"t":0}]}}}]}`;

async function buildDotLottieArchive(entries: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.file(name, content);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

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
});
