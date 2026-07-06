import { describe, expect, it } from "vite-plus/test";

import { lokaliseTmsProvider } from "./lokalise-provider";

describe("lokalise locale readiness", () => {
  it("maps reviewed content to ready via locale progress", () => {
    expect(
      lokaliseTmsProvider.mapLocaleProgressToReadiness({
        locale: "fr",
        counts: { total: 1, translated: 1, approved: 1 },
      }),
    ).toMatchObject({
      translationProgress: 100,
      approvalProgress: 100,
    });
  });

  it("maps empty counts to zero progress", () => {
    expect(
      lokaliseTmsProvider.mapLocaleProgressToReadiness({
        locale: "fr",
        counts: { total: 0, translated: 0, approved: 0 },
      }),
    ).toMatchObject({
      translationProgress: 0,
      approvalProgress: 0,
    });
  });
});
