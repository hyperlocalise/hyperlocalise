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

import { sanitizeLocalisationAuditFindingUrl } from "./finding-url";

describe("sanitizeLocalisationAuditFindingUrl", () => {
  it("allows http(s) URLs on the audited host and its subdomains", () => {
    expect(sanitizeLocalisationAuditFindingUrl("https://example.com/fr", "example.com")).toBe(
      "https://example.com/fr",
    );
    expect(sanitizeLocalisationAuditFindingUrl("https://www.example.com/fr", "example.com")).toBe(
      "https://www.example.com/fr",
    );
    expect(
      sanitizeLocalisationAuditFindingUrl("https://fr.example.com/pricing", "example.com"),
    ).toBe("https://fr.example.com/pricing");
  });

  it("rejects unsafe schemes", () => {
    expect(sanitizeLocalisationAuditFindingUrl("javascript:alert(1)", "example.com")).toBeNull();
    expect(
      sanitizeLocalisationAuditFindingUrl(
        "data:text/html,<script>alert(1)</script>",
        "example.com",
      ),
    ).toBeNull();
  });

  it("rejects credentialed URLs and off-domain hosts", () => {
    expect(
      sanitizeLocalisationAuditFindingUrl("https://user:pass@example.com/fr", "example.com"),
    ).toBeNull();
    expect(
      sanitizeLocalisationAuditFindingUrl("https://evil.example/phish", "example.com"),
    ).toBeNull();
    expect(
      sanitizeLocalisationAuditFindingUrl("https://example.com.evil.test/fr", "example.com"),
    ).toBeNull();
  });
});
