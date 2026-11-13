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

import { buildHomeJsonLd } from "./build-home-json-ld";

describe("buildHomeJsonLd", () => {
  it("marks the free tier offer as available now", () => {
    const jsonLd = buildHomeJsonLd("en");

    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "WebApplication",
      offers: {
        "@type": "Offer",
        availability: "https://schema.org/InStock",
      },
    });
  });
});
