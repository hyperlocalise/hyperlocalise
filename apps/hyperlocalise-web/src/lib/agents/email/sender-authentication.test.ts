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
});
