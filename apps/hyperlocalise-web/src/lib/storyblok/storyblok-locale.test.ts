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

import { mapProjectLocalesToStoryblok, resolveStoryblokLanguage } from "./storyblok-locale";

const languages = [
  { code: "de", name: "German" },
  { code: "pt-br", name: "Portuguese (Brazil)" },
  { code: "es_co", name: "Spanish (Colombia)" },
  { code: "en-us", name: "English (US)" },
  { code: "en-gb", name: "English (UK)" },
];

describe("resolveStoryblokLanguage", () => {
  it("matches codes case- and separator-insensitively", () => {
    expect(resolveStoryblokLanguage("pt-BR", languages)?.code).toBe("pt-br");
    expect(resolveStoryblokLanguage("es-CO", languages)?.code).toBe("es_co");
  });

  it("lets a language-only code cover regional project locales", () => {
    expect(resolveStoryblokLanguage("de-AT", languages)?.code).toBe("de");
  });

  it("does not guess between several regional codes", () => {
    expect(resolveStoryblokLanguage("en", languages)).toBeNull();
  });
});

describe("mapProjectLocalesToStoryblok", () => {
  it("prefers configured targets and reports unmapped ones", () => {
    const result = mapProjectLocalesToStoryblok({
      projectTargetLocales: ["fr-FR"],
      languages,
      configuredTargetLocales: ["de-DE", "ja-JP"],
    });

    expect(result.unmappedProjectTargets).toEqual(["ja-JP"]);
    expect(result.targets).toEqual([
      { projectLocale: "de-DE", storyblokLanguage: { code: "de", name: "German" } },
      { projectLocale: "ja-JP", storyblokLanguage: null, skippedReason: "target_locale_unmapped" },
    ]);
  });
});
