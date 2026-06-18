import { describe, expect, it } from "vite-plus/test";

import { getTmsProviderActionCapability, providerSupportsTmsAction } from "./tms-capabilities";

import { getProviderCommentPusher } from "./adapters/tms-provider-adapter-registry";

describe("getProviderCommentPusher", () => {
  it.each([
    ["smartling", true],
    ["crowdin", true],
    ["lokalise", true],
    ["phrase", false],
  ] as const)("returns whether %s has a comment pusher implementation", (provider, supported) => {
    const pusher = getProviderCommentPusher(provider);
    if (supported) {
      expect(pusher).toBeTypeOf("function");
    } else {
      expect(pusher).toBeNull();
    }
  });
});

describe("unsupported comment capability behavior", () => {
  it("advertises comment write support for Lokalise while Phrase remains read-only at runtime", () => {
    expect(providerSupportsTmsAction("lokalise", "comments.write")).toBe(true);
    expect(getProviderCommentPusher("lokalise")).not.toBeNull();

    expect(providerSupportsTmsAction("phrase", "comments.write")).toBe(true);
    expect(getProviderCommentPusher("phrase")).toBeNull();
    expect(getTmsProviderActionCapability("phrase", "comments.write")).toMatchObject({
      supported: true,
      ui: { state: "enabled" },
    });
  });
});
