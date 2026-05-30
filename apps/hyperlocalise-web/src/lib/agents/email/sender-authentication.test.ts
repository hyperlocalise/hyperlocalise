import { describe, expect, it } from "vite-plus/test";

import { isInboundSenderAuthenticated } from "./sender-authentication";

describe("isInboundSenderAuthenticated", () => {
  it("returns false when authentication headers are missing", () => {
    expect(
      isInboundSenderAuthenticated({
        claimedFromEmail: "user@example.com",
        headers: {},
      }),
    ).toBe(false);
  });

  it("accepts SPF pass for the claimed sender domain", () => {
    expect(
      isInboundSenderAuthenticated({
        claimedFromEmail: "User <user@example.com>",
        headers: {
          "received-spf": "pass (example.com: domain of user@example.com designates sending IP)",
        },
      }),
    ).toBe(true);
  });

  it("rejects SPF softfail for the claimed sender domain", () => {
    expect(
      isInboundSenderAuthenticated({
        claimedFromEmail: "user@example.com",
        headers: {
          "received-spf": "softfail (example.com: domain of user@example.com is not authorized)",
        },
      }),
    ).toBe(false);
  });

  it("accepts authentication-results DKIM pass", () => {
    expect(
      isInboundSenderAuthenticated({
        claimedFromEmail: "user@example.com",
        headers: {
          "authentication-results":
            "mx.example.com; dkim=pass header.d=example.com; spf=none; dmarc=none",
        },
      }),
    ).toBe(true);
  });

  it("rejects uncorrelated DKIM pass when From claims a different domain", () => {
    expect(
      isInboundSenderAuthenticated({
        claimedFromEmail: "user@example.com",
        headers: {
          "authentication-results":
            "mx.example.com; dkim=pass header.d=attacker.com; spf=none; dmarc=fail header.from=example.com",
        },
      }),
    ).toBe(false);
  });

  it("accepts authentication-results DMARC pass for the claimed From domain", () => {
    expect(
      isInboundSenderAuthenticated({
        claimedFromEmail: "user@example.com",
        headers: {
          "authentication-results":
            "mx.example.com; spf=none; dkim=none; dmarc=pass header.from=example.com",
        },
      }),
    ).toBe(true);
  });

  it("rejects Received-SPF pass for a parent-domain suffix attack", () => {
    expect(
      isInboundSenderAuthenticated({
        claimedFromEmail: "user@example.com",
        headers: {
          "received-spf":
            "pass (example.com.attacker.com: domain of bounce@example.com.attacker.com designates sending IP)",
        },
      }),
    ).toBe(false);
  });

  it("rejects DKIM pass for a parent-domain suffix attack", () => {
    expect(
      isInboundSenderAuthenticated({
        claimedFromEmail: "user@example.com",
        headers: {
          "authentication-results":
            "mx.example.com; dkim=pass header.d=example.com.attacker.com; spf=none; dmarc=none",
        },
      }),
    ).toBe(false);
  });
});
