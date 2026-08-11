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

import { runTechnicalLocalisationChecks } from "./technical-checks";

describe("runTechnicalLocalisationChecks", () => {
  it("matches locale prefixes against absolute URL pathnames", () => {
    const result = runTechnicalLocalisationChecks({
      focusLocales: [],
      pages: [
        {
          url: "https://example.com/fr/pricing",
          status: 200,
          htmlLang: "en",
          title: "Pricing",
          textSample: "Buy now. Pricing plans for growing teams around the world.",
          hreflang: [],
        },
      ],
    });

    expect(result.findings.some((finding) => finding.id.startsWith("lang-mismatch-"))).toBe(true);
    expect(result.findings.some((finding) => finding.id.startsWith("untranslated-"))).toBe(true);
    expect(result.detectedLocales.some((locale) => locale.locale === "fr")).toBe(true);
  });
});
