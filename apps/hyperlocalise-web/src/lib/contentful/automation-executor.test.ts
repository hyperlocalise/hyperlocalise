import { describe, expect, it, vi } from "vite-plus/test";

import { resolveAggregatedContentfulWebhookProcessingStatus } from "./events";
import { localizeContentfulAssetForLocale } from "./image-localization";
import {
  contentfulQaFindingsContainError,
  createLocalizedAssetCache,
  ensureLocalizedAssets,
  resolveContentfulExecutionTargetLocales,
} from "./automation-executor";
import type { ContentfulManagementClient } from "./client";

vi.mock("./image-localization", () => ({
  localizeContentfulAssetForLocale: vi.fn(),
}));

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

  it("detects QA errors separately from warnings", () => {
    expect(
      contentfulQaFindingsContainError([
        { severity: "warning", checkType: "markdown_link" },
        { severity: "info", checkType: "style" },
      ]),
    ).toBe(false);

    expect(
      contentfulQaFindingsContainError([
        { severity: "warning", checkType: "markdown_link" },
        { severity: "error", checkType: "placeholder_mismatch" },
      ]),
    ).toBe(true);
  });

  it("shares in-flight localized asset creation across concurrent callers", async () => {
    vi.mocked(localizeContentfulAssetForLocale).mockImplementation(async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        sourceAssetId: input.assetId,
        localizedAssetId: "asset-localized",
        fileName: "hero-fr-fr.png",
      };
    });

    const cache = createLocalizedAssetCache();
    const client = {} as ContentfulManagementClient;
    const [first, second] = await Promise.all([
      ensureLocalizedAssets({
        client,
        sourceLocale: "en-US",
        targetLocale: "fr-FR",
        fieldName: "Hero image",
        assetIds: ["asset-source"],
        cache,
      }),
      ensureLocalizedAssets({
        client,
        sourceLocale: "en-US",
        targetLocale: "fr-FR",
        fieldName: "Hero image",
        assetIds: ["asset-source"],
        cache,
      }),
    ]);

    expect(localizeContentfulAssetForLocale).toHaveBeenCalledTimes(1);
    expect(first.get("asset-source")).toBe("asset-localized");
    expect(second.get("asset-source")).toBe("asset-localized");
  });
});
