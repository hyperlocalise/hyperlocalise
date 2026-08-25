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

import { COMMON_LOCALES } from "@/lib/i18n/locales";

import { availableConceptTermLocales } from "./available-concept-term-locales";

describe("availableConceptTermLocales", () => {
  it("keeps the source locale and occupied locales selectable for synonyms", () => {
    const locales = availableConceptTermLocales(["en", "vi-VN", "fr-FR"]);

    expect(locales).toEqual(["en", "vi-VN", "fr-FR"]);
    expect(locales).toContain("en");
  });

  it("offers the full common locale list by default", () => {
    expect(availableConceptTermLocales()).toEqual(COMMON_LOCALES);
  });
});
