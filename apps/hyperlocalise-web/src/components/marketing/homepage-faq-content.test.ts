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

import { buildHomepageFaqJsonLd, getHomepageFaqItems } from "./homepage-faq-content";

describe("homepage FAQ content", () => {
  it("builds matching visible content and FAQPage structured data", () => {
    const items = getHomepageFaqItems("en");
    const jsonLd = buildHomepageFaqJsonLd(items);

    expect(items).toHaveLength(12);
    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "FAQPage",
    });
    expect(jsonLd.mainEntity).toEqual(
      items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    );
  });
});
