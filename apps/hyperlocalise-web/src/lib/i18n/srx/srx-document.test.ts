// @vitest-environment happy-dom

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

import { SRX_BUILTIN_XML } from "@/lib/i18n/srx/srx-builtin-xml";
import { SRX_CUSTOM_XML_PLACEHOLDER } from "@/lib/i18n/srx/srx-template-samples";
import {
  loadBuiltinSrxDocument,
  parseSrxXml,
  serializeSrxXml,
  validateSrxDocument,
} from "@/lib/i18n/srx/srx-document";

describe("parseSrxXml", () => {
  it("parses built-in default template", () => {
    const result = parseSrxXml(SRX_BUILTIN_XML.default);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.model.languageRules).toHaveLength(1);
    expect(result.model.languageRules[0].languageName).toBe("Default");
    expect(result.model.languageRules[0].rules.length).toBeGreaterThan(0);
    expect(validateSrxDocument(result.model)).toEqual([]);
  });

  it("parses custom placeholder XML", () => {
    const result = parseSrxXml(SRX_CUSTOM_XML_PLACEHOLDER);
    expect(result.ok).toBe(true);
  });

  it("round-trips through serialize", () => {
    for (const template of ["default", "html", "markdown"] as const) {
      const loaded = loadBuiltinSrxDocument(template);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) {
        continue;
      }
      const xml = serializeSrxXml(loaded.model);
      const reparsed = parseSrxXml(xml);
      expect(reparsed.ok).toBe(true);
      if (!reparsed.ok) {
        continue;
      }
      expect(reparsed.model.cascade).toBe(loaded.model.cascade);
      expect(reparsed.model.languageRules.map((r) => r.languageName)).toEqual(
        loaded.model.languageRules.map((r) => r.languageName),
      );
      expect(reparsed.model.languageRules[0].rules.map((r) => r.beforeBreak)).toEqual(
        loaded.model.languageRules[0].rules.map((r) => r.beforeBreak),
      );
    }
  });
});
