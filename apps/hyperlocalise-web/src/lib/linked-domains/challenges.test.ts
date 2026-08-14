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

import {
  buildLinkedDomainChallenges,
  dnsTxtRecordMatchesToken,
  htmlBodyMatchesToken,
  htmlContainsVerificationMeta,
  linkedDomainDnsTxtHost,
  linkedDomainDnsTxtValue,
} from "./challenges";

describe("linked domain challenges", () => {
  it("builds DNS, HTML, and meta challenge material", () => {
    const challenges = buildLinkedDomainChallenges({
      domainKey: "example.com",
      sourceUrl: "https://example.com/",
      token: "abc123",
    });

    expect(challenges.dnsTxt.host).toBe(linkedDomainDnsTxtHost("example.com"));
    expect(challenges.dnsTxt.value).toBe(linkedDomainDnsTxtValue("abc123"));
    expect(challenges.htmlFile.url).toBe(
      "https://example.com/.well-known/hyperlocalise-verification.txt",
    );
    expect(challenges.htmlFile.body).toBe("abc123");
    expect(challenges.metaTag.html).toContain('name="hyperlocalise-site-verification"');
    expect(challenges.metaTag.html).toContain('content="abc123"');
  });

  it("matches DNS TXT records with or without the prefix", () => {
    expect(dnsTxtRecordMatchesToken("abc123", "abc123")).toBe(true);
    expect(dnsTxtRecordMatchesToken("hyperlocalise-site-verification=abc123", "abc123")).toBe(true);
    expect(dnsTxtRecordMatchesToken('"hyperlocalise-site-verification=abc123"', "abc123")).toBe(
      true,
    );
    expect(dnsTxtRecordMatchesToken("other", "abc123")).toBe(false);
  });

  it("matches HTML body tokens exactly after trim", () => {
    expect(htmlBodyMatchesToken("  abc123\n", "abc123")).toBe(true);
    expect(htmlBodyMatchesToken("abc124", "abc123")).toBe(false);
  });

  it("detects verification meta tags in either attribute order", () => {
    expect(
      htmlContainsVerificationMeta(
        '<html><head><meta name="hyperlocalise-site-verification" content="abc123" /></head></html>',
        "abc123",
      ),
    ).toBe(true);
    expect(
      htmlContainsVerificationMeta(
        '<meta content="abc123" name="hyperlocalise-site-verification">',
        "abc123",
      ),
    ).toBe(true);
    expect(
      htmlContainsVerificationMeta(
        '<meta name="hyperlocalise-site-verification" content="nope" />',
        "abc123",
      ),
    ).toBe(false);
  });
});
