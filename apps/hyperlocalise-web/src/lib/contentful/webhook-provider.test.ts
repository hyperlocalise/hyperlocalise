import { describe, expect, it } from "vite-plus/test";

import { env } from "@/lib/env";

import {
  buildContentfulWebhookCallbackUrl,
  buildContentfulProviderWebhookFilters,
  buildContentfulProviderWebhookName,
  contentfulWebhookCallbackUrl,
} from "./webhook-provider";

describe("contentful webhook provider helpers", () => {
  it("builds callback URLs from the public app base", () => {
    expect(contentfulWebhookCallbackUrl("subscription-1")).toBe(
      buildContentfulWebhookCallbackUrl(env.HYPERLOCALISE_PUBLIC_APP_URL!, "subscription-1"),
    );
  });

  it("builds callback URLs without double slashes when the public app base ends with a slash", () => {
    expect(
      buildContentfulWebhookCallbackUrl("https://www.hyperlocalise.com/", "subscription-1"),
    ).toBe("https://www.hyperlocalise.com/api/webhooks/contentful/subscription-1");
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
