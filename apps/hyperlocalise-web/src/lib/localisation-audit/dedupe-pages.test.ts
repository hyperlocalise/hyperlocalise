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

import { dedupeAuditedPages } from "./dedupe-pages";
import type { AuditedPage } from "./types";

function failedPage(url: string, locale: string, isPrimary = false): AuditedPage {
  return {
    url,
    locale,
    isPrimary,
    status: "failed",
    failureCode: "audit_fetch_failed",
  };
}

describe("dedupeAuditedPages", () => {
  it("keeps the primary page when an alternative redirects to its final URL", () => {
    const primary = failedPage("https://example.com/fr/", "fr-FR", true);
    const redirectedAlternative = failedPage("https://example.com/fr/", "fr-CA");

    expect(dedupeAuditedPages([primary, redirectedAlternative])).toEqual([primary]);
  });

  it("keeps only the first alternative for each final URL", () => {
    const primary = failedPage("https://example.com/", "en-US", true);
    const french = failedPage("https://example.com/fr/", "fr-FR");
    const duplicateFrench = failedPage("https://example.com/fr/", "fr-CA");

    expect(dedupeAuditedPages([primary, french, duplicateFrench])).toEqual([primary, french]);
  });
});
