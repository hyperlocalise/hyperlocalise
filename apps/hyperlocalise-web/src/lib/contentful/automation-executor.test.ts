import { describe, expect, it } from "vite-plus/test";

import { resolveAggregatedContentfulWebhookProcessingStatus } from "./events";
import { resolveContentfulExecutionTargetLocales } from "./automation-executor";

describe("contentful automation executor", () => {
  it("aggregates webhook event status only after all sibling runs finish", () => {
    expect(resolveAggregatedContentfulWebhookProcessingStatus([])).toBeNull();
    expect(resolveAggregatedContentfulWebhookProcessingStatus(["running"])).toBeNull();
    expect(resolveAggregatedContentfulWebhookProcessingStatus(["succeeded", "running"])).toBeNull();
    expect(
      resolveAggregatedContentfulWebhookProcessingStatus(["succeeded", "succeeded_with_warnings"]),
    ).toBe("succeeded");
    expect(resolveAggregatedContentfulWebhookProcessingStatus(["succeeded", "failed"])).toBe(
      "failed",
    );
  });

  it("uses the translation run target locales before falling back to the connection locales", () => {
    expect(
      resolveContentfulExecutionTargetLocales({
        runTargetLocales: ["fr-FR"],
        connectionTargetLocales: ["fr-FR", "de-DE"],
      }),
    ).toEqual(["fr-FR"]);

    expect(
      resolveContentfulExecutionTargetLocales({
        runTargetLocales: [],
        connectionTargetLocales: ["fr-FR", "de-DE"],
      }),
    ).toEqual(["fr-FR", "de-DE"]);
  });
});
