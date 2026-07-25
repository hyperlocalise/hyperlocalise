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

import { hostnameToDomainSlug, isValidDomainSlug, resolveDomainIdentity } from "./domain-slug";

describe("hostnameToDomainSlug", () => {
  it("maps hostnames to a-z and hyphen slugs", () => {
    expect(hostnameToDomainSlug("stripe.com")).toBe("stripe-com");
    expect(hostnameToDomainSlug("www.Stripe.com")).toBe("stripe-com");
    expect(hostnameToDomainSlug("shop.acme.co.uk")).toBe("shop-acme-co-uk");
  });

  it("drops digits so slugs stay a-z and hyphen only", () => {
    expect(hostnameToDomainSlug("web3.io")).toBe("web-io");
    expect(isValidDomainSlug(hostnameToDomainSlug("web3.io"))).toBe(true);
  });
});

describe("resolveDomainIdentity", () => {
  it("accepts bare domains and https URLs", () => {
    const bare = resolveDomainIdentity("example.com");
    expect(bare.ok).toBe(true);
    if (bare.ok) {
      expect(bare.value.domainKey).toBe("example.com");
      expect(bare.value.domainSlug).toBe("example-com");
      expect(bare.value.sourceUrl).toBe("https://example.com/");
    }

    const full = resolveDomainIdentity("https://www.example.com/pricing?x=1");
    expect(full.ok).toBe(true);
    if (full.ok) {
      expect(full.value.domainKey).toBe("example.com");
      expect(full.value.domainSlug).toBe("example-com");
    }
  });

  it("rejects invalid slugs and private hosts", () => {
    expect(resolveDomainIdentity("http://127.0.0.1").ok).toBe(false);
    expect(isValidDomainSlug("stripe.com")).toBe(false);
    expect(isValidDomainSlug("stripe-com")).toBe(true);
  });
});
