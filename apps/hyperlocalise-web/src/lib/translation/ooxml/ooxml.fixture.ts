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
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";

/** Office fixtures shared with the Go parser, stored unzipped so diffs stay readable. */
export const OOXML_FIXTURE_DIR = fileURLToPath(
  new URL("../../../../../../internal/i18n/translationfileparser/testdata/ooxml/", import.meta.url),
);

export type OoxmlFixtureName = "docx-basic" | "pptx-basic";

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/** Zips an unzipped fixture directory into an Office package. */
export async function ooxmlFixture(name: OoxmlFixtureName): Promise<Uint8Array> {
  const root = join(OOXML_FIXTURE_DIR, name);
  const zip = new JSZip();
  for (const path of listFiles(root).toSorted()) {
    zip.file(relative(root, path).split("\\").join("/"), readFileSync(path));
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
