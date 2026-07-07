import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { err, ok } from "@/lib/primitives/result/results";

import { resolveAggregatedContentfulWebhookProcessingStatus } from "./events";
import { localizeContentfulAssetForLocale } from "./image-localization";
import {
  contentfulQaFindingsContainError,
  createLocalizedAssetCache,
  ensureLocalizedAssets,
  resolveContentfulExecutionTargetLocales,
  translateTextUnit,
} from "./automation-executor";
import type { ContentfulManagementClient } from "./client";
import type { ContentfulTranslatableUnit } from "./types";

const mocks = vi.hoisted(() => {
  const runItemValues: Array<Record<string, unknown>> = [];
  const loggerWarn = vi.fn();
  return {
    loggerWarn,
    runItemValues,
    insert: vi.fn(() => ({
      values: vi.fn(async (value: Record<string, unknown>) => {
        runItemValues.push(value);
      }),
    })),
    assembleStringTranslationContextSnapshot: vi.fn(),
  };
});

vi.mock("@/lib/log", () => ({
  createLogger: vi.fn(() => ({
    warn: mocks.loggerWarn,
    info: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock("@/lib/database", () => ({
  db: {
    insert: mocks.insert,
  },
  schema: {
    contentfulTranslationRunItems: {},
  },
}));

vi.mock("@/lib/translation/context", () => ({
  assembleStringTranslationContextSnapshot: mocks.assembleStringTranslationContextSnapshot,
}));

vi.mock("./image-localization", () => ({
  localizeContentfulAssetForLocale: vi.fn(),
}));

describe("contentful automation executor", () => {
  beforeEach(() => {
    mocks.runItemValues.length = 0;
    mocks.loggerWarn.mockClear();
    mocks.insert.mockClear();
    mocks.assembleStringTranslationContextSnapshot.mockReset();
    vi.mocked(localizeContentfulAssetForLocale).mockReset();
  });

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

  it("uses the translation run target locales", () => {
    expect(
      resolveContentfulExecutionTargetLocales({
        runTargetLocales: ["fr-FR"],
      }),
    ).toEqual(["fr-FR"]);

    expect(
      resolveContentfulExecutionTargetLocales({
        runTargetLocales: [],
      }),
    ).toEqual([]);
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
      return ok({
        sourceAssetId: input.assetId,
        localizedAssetId: "asset-localized",
        fileName: "hero-fr-fr.png",
      });
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

  it("writes translated rich-text locales with source assets when embedded asset localization fails", async () => {
    mocks.assembleStringTranslationContextSnapshot.mockResolvedValue({
      ok: true,
      snapshot: {
        glossaryTerms: [],
        translationMemoryMatches: [],
      },
    });
    vi.mocked(localizeContentfulAssetForLocale).mockImplementation(async (input) => {
      if (input.targetLocale === "de-DE") {
        return err({
          code: "contentful_request_failed",
          status: 404,
          message: "The resource could not be found",
          operation: "upload_asset_file",
          contentfulErrorId: "NotFound",
        });
      }
      return ok({
        sourceAssetId: input.assetId,
        localizedAssetId: "asset-fr-fr",
        fileName: "hero-fr-fr.png",
      });
    });

    const sourceValue = {
      nodeType: "document",
      data: {},
      content: [
        {
          nodeType: "paragraph",
          data: {},
          content: [{ nodeType: "text", value: "Hero copy", marks: [], data: {} }],
        },
        {
          nodeType: "embedded-asset-block",
          data: {
            target: {
              sys: {
                type: "Link",
                linkType: "Asset",
                id: "asset-source",
              },
            },
          },
          content: [],
        },
      ],
    };
    const unit: ContentfulTranslatableUnit = {
      kind: "text",
      externalStringId: "entry-1:body",
      key: "entry-1.body",
      fieldId: "body",
      fieldName: "Body",
      sourceLocale: "en-US",
      sourceValue,
      sourceText: "Hero copy",
      existingTranslations: [],
      contentfulValueKind: "rich_text",
      embeddedAssetIds: ["asset-source"],
    };

    const result = await translateTextUnit({
      organizationId: "org-1",
      projectId: "project-1",
      projectName: "Website",
      projectTranslationContext: "",
      runId: "run-1",
      unit,
      targetLocales: ["fr-FR", "de-DE"],
      translateStringJob: async () => ({
        translations: [
          { locale: "fr-FR", text: "Texte hero" },
          { locale: "de-DE", text: "Hero-Text" },
        ],
      }),
      runQa: true,
      client: {} as ContentfulManagementClient,
      localizedAssetCache: createLocalizedAssetCache(),
      logContext: {
        contentfulTranslationRunId: "run-1",
        workspaceAutomationRunId: "automation-run-1",
        organizationId: "org-1",
        runId: "run-1",
        fieldId: "body",
        fieldKind: "text",
      },
    });

    expect(mocks.assembleStringTranslationContextSnapshot).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        sourceLocale: "en-US",
        targetLocales: ["fr-FR", "de-DE"],
      }),
      undefined,
      { organizationId: "org-1" },
    );
    expect(result.translations).toHaveLength(2);
    expect(result.translations[0]).toMatchObject({
      fieldId: "body",
      locale: "fr-FR",
    });
    expect(result.translations[0]?.value).toMatchObject({
      content: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            target: expect.objectContaining({
              sys: expect.objectContaining({ id: "asset-fr-fr" }),
            }),
          }),
        }),
      ]),
    });
    expect(result.translations[1]).toMatchObject({
      fieldId: "body",
      locale: "de-DE",
    });
    expect(result.translations[1]?.value).toMatchObject({
      content: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            target: expect.objectContaining({
              sys: expect.objectContaining({ id: "asset-source" }),
            }),
          }),
        }),
      ]),
    });
    expect(mocks.runItemValues).toMatchObject([
      {
        runId: "run-1",
        fieldId: "body",
        locale: "fr-FR",
        status: "translated",
        translationPreview: "Texte hero",
      },
      {
        runId: "run-1",
        fieldId: "body",
        locale: "de-DE",
        status: "translated_partial",
        translationPreview: "Hero-Text",
      },
    ]);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "embedded_asset_localization_failed",
        locale: "de-DE",
        contentfulStatus: 404,
        contentfulOperation: "upload_asset_file",
        contentfulErrorId: "NotFound",
      }),
      "contentful automation preserved embedded asset references after localization failed",
    );
  });
});
