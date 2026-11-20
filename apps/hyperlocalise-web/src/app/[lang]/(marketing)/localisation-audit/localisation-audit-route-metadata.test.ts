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

import { getIntlShape } from "@/lib/app-i18n/intl";

import {
  getLocalisationAuditResultRouteMetadata,
  getLocalisationAuditRouteMetadata,
} from "./localisation-audit-route-metadata";

describe("getLocalisationAuditRouteMetadata", () => {
  it("leads the title with the search query and names localization in the description", () => {
    const metadata = getLocalisationAuditRouteMetadata(getIntlShape("en"));

    expect(metadata.title).toBe("Free localisation audit (0–100) | Hyperlocalise");
    expect(metadata.description).toContain("localization");
    expect(metadata.description).toContain("hreflang");
  });
});

describe("getLocalisationAuditResultRouteMetadata", () => {
  it("leads a scored title with the company name and score", () => {
    const metadata = getLocalisationAuditResultRouteMetadata(getIntlShape("en"), {
      domainKey: "acme.example",
      companyName: "Acme",
      score: 86,
    });

    expect(metadata.title).toBe("Acme localisation score 86/100 | Hyperlocalise");
    expect(metadata.description).toContain("Acme scored 86/100");
    expect(metadata.description).toContain("acme.example");
    expect(metadata.description).toContain("Hreflang");
  });

  it("falls back to the domain when the company name is missing", () => {
    const metadata = getLocalisationAuditResultRouteMetadata(getIntlShape("en"), {
      domainKey: "acme.example",
      companyName: "  ",
      score: null,
    });

    expect(metadata.title).toBe("acme.example localisation audit | Hyperlocalise");
    expect(metadata.description).toBe("Localisation health check results for acme.example.");
  });
});
