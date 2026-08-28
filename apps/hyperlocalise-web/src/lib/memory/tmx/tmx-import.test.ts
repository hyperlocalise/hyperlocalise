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

import { isOk } from "@/lib/primitives/result/results";

import { parseTmxDocument } from "./parse-tmx";
import {
  documentToImportCandidates,
  languagesMatch,
  samePrimaryLanguage,
} from "./tmx-import";

describe("samePrimaryLanguage", () => {
  it("treats regional and script siblings as the same language", () => {
    expect(samePrimaryLanguage("en-US", "en-GB")).toBe(true);
    expect(samePrimaryLanguage("zh-Hans", "zh-Hant")).toBe(true);
    expect(samePrimaryLanguage("en", "en-US")).toBe(true);
    expect(samePrimaryLanguage("en-US", "fr-FR")).toBe(false);
  });

  it("keeps asymmetric prefix matching for source selection only", () => {
    expect(languagesMatch("en", "en-US")).toBe(true);
    expect(languagesMatch("en-US", "en-GB")).toBe(false);
  });
});

describe("documentToImportCandidates same-language targets", () => {
  it("does not create en-US→en-GB translation pairs inside one unit", () => {
    const parsed = parseTmxDocument(`<?xml version="1.0" encoding="UTF-8"?>
<tmx version="1.4">
  <header srclang="en" creationtool="t" creationtoolversion="1" segtype="sentence" o-tmf="t" adminlang="en" datatype="plaintext"/>
  <body>
    <tu tuid="dialect-1">
      <tuv xml:lang="en-US"><seg>Color</seg></tuv>
      <tuv xml:lang="en-GB"><seg>Colour</seg></tuv>
      <tuv xml:lang="fr-FR"><seg>Couleur</seg></tuv>
    </tu>
  </body>
</tmx>`);
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) {
      return;
    }
    const mapped = documentToImportCandidates(parsed.value);
    expect(mapped.candidates.map((candidate) => candidate.targetLocale)).toEqual(["fr-FR"]);
    expect(mapped.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "same_language_variant_skipped",
          message: expect.stringContaining("en-GB"),
        }),
      ]),
    );
  });
});
