import { describe, expect, it } from "vite-plus/test";

import {
  buildContentfulProviderWebhookFilters,
  buildContentfulProviderWebhookName,
  contentfulWebhookCallbackUrl,
} from "./webhook-provider";

describe("contentful webhook provider helpers", () => {
  it("builds callback URLs from the public app base", () => {
    expect(contentfulWebhookCallbackUrl("subscription-1")).toBe(
      "https://app.example.com/api/webhooks/contentful/subscription-1",
    );
  });

  it("builds provider webhook names and filters", () => {
    expect(buildContentfulProviderWebhookName("Help Center")).toBe("Hyperlocalise: Help Center");
    expect(buildContentfulProviderWebhookFilters([])).toEqual([]);
    expect(buildContentfulProviderWebhookFilters(["article"])).toEqual([
      {
        equals: [{ doc: "sys.contentType.sys.id" }, "article"],
      },
    ]);
    expect(buildContentfulProviderWebhookFilters(["article", "blogPost"])).toEqual([
      {
        in: [{ doc: "sys.contentType.sys.id" }, ["article", "blogPost"]],
      },
    ]);
  });
});
