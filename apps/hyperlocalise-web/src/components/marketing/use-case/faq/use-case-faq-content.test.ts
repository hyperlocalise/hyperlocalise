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

import { buildHomepageFaqJsonLd } from "@/components/marketing/homepage-faq-content";
import { useCaseSlugs } from "@/components/marketing/use-case/use-case-page-content";

import type { UseCaseFaqSlug } from "./use-case-faq-types";
import { getUseCaseFaqItems, getUseCaseFaqSectionCopy } from "./use-case-faq-content";

describe("getUseCaseFaqItems", () => {
  it("returns eight FAQs per use case slug with FAQPage-ready strings", () => {
    for (const slug of useCaseSlugs) {
      const faqSlug = slug as UseCaseFaqSlug;
      const items = getUseCaseFaqItems(faqSlug, "en");
      const copy = getUseCaseFaqSectionCopy(faqSlug, "en");

      expect(items).toHaveLength(8);
      expect(copy.heading.length).toBeGreaterThan(0);
      expect(copy.subheading.length).toBeGreaterThan(0);

      const jsonLd = buildHomepageFaqJsonLd("en", items);
      expect(jsonLd["@type"]).toBe("FAQPage");
      const mainEntity = jsonLd.mainEntity;
      expect(Array.isArray(mainEntity) ? mainEntity.length : 0).toBe(8);
    }
  });

  it("answers Zendesk help center localisation on the matching page", () => {
    const items = getUseCaseFaqItems("help-center-localisation", "en");
    expect(items[0]?.question).toMatch(/Zendesk/i);
  });
});
