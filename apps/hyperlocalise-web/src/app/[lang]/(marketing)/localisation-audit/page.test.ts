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

import { SITE_URL } from "@/lib/seo/site-url";

import { generateMetadata } from "./page";

describe("localisation audit metadata", () => {
  it("is indexable and includes localized canonical and language alternatives", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ lang: "de-DE" }),
    });

    expect(metadata.robots).toEqual({
      index: true,
      follow: true,
    });
    expect(metadata.alternates?.canonical).toBe(`${SITE_URL}/de-DE/localisation-audit`);
    expect(metadata.alternates?.languages).toMatchObject({
      en: `${SITE_URL}/en/localisation-audit`,
      "de-DE": `${SITE_URL}/de-DE/localisation-audit`,
      "x-default": `${SITE_URL}/en/localisation-audit`,
    });
  });
});
