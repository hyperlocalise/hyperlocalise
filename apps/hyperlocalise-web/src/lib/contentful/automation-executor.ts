import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { StringTranslationJobInput } from "@/api/routes/project/job.schema";
import { db, schema } from "@/lib/database";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { assembleStringTranslationContextSnapshot } from "@/lib/translation/assemble-translation-context";
import { loadOrganizationOpenAITranslationGenerator } from "@/lib/translation/load-organization-translation-generator";
import type { StringTranslationGenerator } from "@/lib/translation/string-job-executor";

import { ContentfulManagementClient, isContentfulClientError } from "./client";
import { loadContentfulConnectionWithToken } from "./connections";
import {
  detectContentfulTranslatableFields,
  formatTranslatedValueForContentful,
} from "./field-detector";
import { syncContentfulWebhookEventStatus } from "./events";
import { localizeContentfulAssetForLocale } from "./image-localization";
import type {
  ContentfulAutomationExecutionError,
  ContentfulAutomationExecutionSuccess,
  ContentfulConnectionFieldConfig,
  ContentfulDraftTranslation,
  ContentfulImageUnit,
  ContentfulTranslatableFieldUnit,
  ContentfulTranslatableUnit,
} from "./types";

const MAX_CONCURRENT_CONTENTFUL_TRANSLATIONS = 3;
const URL_REGEX = /https?:\/\/[^\s)]+/g;
const PLACEHOLDER_REGEX = /(\{\{[^}]+\}\}|\{[A-Za-z0-9_.-]+\}|%[sdif])/g;

export type ContentfulAutomationExecutionEvent = {
  contentfulTranslationRunId: string;
  workspaceAutomationRunId: string;
  organizationId: string;
};

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function resolveContentfulExecutionTargetLocales(input: {
  runTargetLocales: string[];
  connectionTargetLocales: string[];
}) {
  return input.runTargetLocales.length > 0 ? input.runTargetLocales : input.connectionTargetLocales;
}

function extractMatches(text: string, regex: RegExp) {
  return new Set(text.match(regex) ?? []);
}

function collectBasicQaFindings(input: {
  unit: ContentfulTranslatableUnit;
  locale: string;
  translatedText: string;
}) {
  const findings: Array<Record<string, unknown>> = [];
  const sourcePlaceholders = extractMatches(input.unit.sourceText, PLACEHOLDER_REGEX);
  const targetPlaceholders = extractMatches(input.translatedText, PLACEHOLDER_REGEX);
  for (const placeholder of sourcePlaceholders) {
    if (!targetPlaceholders.has(placeholder)) {
      findings.push({
        checkType: "placeholder_mismatch",
        severity: "error",
        locale: input.locale,
        fieldId: input.unit.fieldId,
        placeholder,
      });
    }
  }

  const sourceLinks = extractMatches(input.unit.sourceText, URL_REGEX);
  const targetLinks = extractMatches(input.translatedText, URL_REGEX);
  for (const link of sourceLinks) {
    if (!targetLinks.has(link)) {
      findings.push({
        checkType: "markdown_link",
        severity: "warning",
        locale: input.locale,
        fieldId: input.unit.fieldId,
        link,
      });
    }
  }

  return findings;
}

export function contentfulQaFindingsContainError(findings: Array<Record<string, unknown>>) {
  return findings.some((finding) => finding.severity === "error");
}

function localizedAssetCacheKey(sourceAssetId: string, targetLocale: string) {
  return `${sourceAssetId}:${targetLocale}`;
}

export type LocalizedAssetCache = Map<string, Promise<string>>;

export function createLocalizedAssetCache(): LocalizedAssetCache {
  return new Map();
}

async function getLocalizedAssetId(input: {
  client: ContentfulManagementClient;
  sourceLocale: string;
  targetLocale: string;
  fieldName: string;
  assetId: string;
  cache: LocalizedAssetCache;
}) {
  const cacheKey = localizedAssetCacheKey(input.assetId, input.targetLocale);
  const cached = input.cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const localizedAssetIdPromise = localizeContentfulAssetForLocale({
    client: input.client,
    assetId: input.assetId,
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    fieldName: input.fieldName,
  }).then((localizedResult) => {
    if (isErr(localizedResult)) {
      throw localizedResult.error;
    }
    return localizedResult.value.localizedAssetId;
  });
  input.cache.set(cacheKey, localizedAssetIdPromise);

  try {
    return await localizedAssetIdPromise;
  } catch (error) {
    input.cache.delete(cacheKey);
    throw error;
  }
}

export async function ensureLocalizedAssets(input: {
  client: ContentfulManagementClient;
  sourceLocale: string;
  targetLocale: string;
  fieldName: string;
  assetIds: string[];
  cache: LocalizedAssetCache;
}) {
  const localizedBySourceId = new Map<string, string>();
  for (const assetId of input.assetIds) {
    const localizedAssetId = await getLocalizedAssetId({
      client: input.client,
      assetId,
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      fieldName: input.fieldName,
      cache: input.cache,
    });
    localizedBySourceId.set(assetId, localizedAssetId);
  }
  return localizedBySourceId;
}

function getContentfulAutomationErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function createTextRunItem(input: {
  runId: string;
  unit: ContentfulTranslatableUnit;
  locale: string;
  status: string;
  translatedText?: string;
  qaFindings?: Array<Record<string, unknown>>;
  error?: Record<string, unknown>;
}) {
  await db.insert(schema.contentfulTranslationRunItems).values({
    runId: input.runId,
    fieldId: input.unit.fieldId,
    fieldName: input.unit.fieldName,
    locale: input.locale,
    status: input.status,
    sourceHash: sha256(input.unit.sourceText),
    sourcePreview: input.unit.sourceText.slice(0, 160),
    translationPreview: input.translatedText ? input.translatedText.slice(0, 160) : null,
    qaFindings: input.qaFindings ?? [],
    error: input.error ?? null,
  });
}

async function createImageRunItem(input: {
  runId: string;
  unit: ContentfulImageUnit;
  locale: string;
  status: string;
  localizedAssetId?: string;
  error?: Record<string, unknown>;
}) {
  await db.insert(schema.contentfulTranslationRunItems).values({
    runId: input.runId,
    fieldId: input.unit.fieldId,
    fieldName: input.unit.fieldName,
    locale: input.locale,
    status: input.status,
    sourceHash: sha256(input.unit.assetId),
    sourcePreview: `asset:${input.unit.assetId}`.slice(0, 160),
    translationPreview: input.localizedAssetId
      ? `asset:${input.localizedAssetId}`.slice(0, 160)
      : null,
    qaFindings: [],
    error: input.error ?? null,
  });
}

export async function translateTextUnit(input: {
  organizationId: string;
  projectId: string;
  projectName: string;
  projectTranslationContext: string;
  runId: string;
  unit: ContentfulTranslatableUnit;
  targetLocales: string[];
  translateStringJob: StringTranslationGenerator;
  runQa: boolean;
  client: ContentfulManagementClient;
  localizedAssetCache: LocalizedAssetCache;
}) {
  const existingLocales = new Set(
    input.unit.existingTranslations.map((translation) => translation.locale),
  );
  const targetLocales = input.targetLocales.filter((locale) => !existingLocales.has(locale));
  if (targetLocales.length === 0) {
    return {
      translations: [] as ContentfulDraftTranslation[],
      qaFindings: [] as Array<Record<string, unknown>>,
      skipped: input.targetLocales.length,
    };
  }

  const jobInput: StringTranslationJobInput = {
    sourceLocale: input.unit.sourceLocale,
    targetLocales,
    sourceText: input.unit.sourceText,
    context: `${input.unit.fieldName} (${input.unit.key})`,
    metadata: {
      providerKind: "contentful",
      externalStringId: input.unit.externalStringId,
      key: input.unit.key,
      fieldId: input.unit.fieldId,
    },
  };
  const contextSnapshot = await assembleStringTranslationContextSnapshot(
    input.projectId,
    jobInput,
    null,
    {
      organizationId: input.organizationId,
    },
  );

  if (!contextSnapshot.ok) {
    await Promise.all(
      targetLocales.map((locale) =>
        createTextRunItem({
          runId: input.runId,
          unit: input.unit,
          locale,
          status: "failed",
          error: { code: contextSnapshot.code, message: contextSnapshot.message },
        }),
      ),
    );
    return {
      translations: [],
      qaFindings: [],
      skipped: 0,
    };
  }

  const result = await input.translateStringJob({
    projectName: input.projectName,
    projectTranslationContext: input.projectTranslationContext,
    jobInput,
    contextSnapshot: {
      glossaryTerms: contextSnapshot.snapshot.glossaryTerms,
      translationMemoryMatches: contextSnapshot.snapshot.translationMemoryMatches,
    },
  });

  const qaFindings: Array<Record<string, unknown>> = [];
  const translations: ContentfulDraftTranslation[] = [];
  for (const translation of result.translations) {
    const findings = input.runQa
      ? collectBasicQaFindings({
          unit: input.unit,
          locale: translation.locale,
          translatedText: translation.text,
        })
      : [];
    qaFindings.push(...findings);
    const hasQaError = contentfulQaFindingsContainError(findings);
    if (!hasQaError) {
      let localizedAssetIdsBySourceId: Map<string, string> | undefined;
      if (input.unit.embeddedAssetIds && input.unit.embeddedAssetIds.length > 0) {
        try {
          localizedAssetIdsBySourceId = await ensureLocalizedAssets({
            client: input.client,
            sourceLocale: input.unit.sourceLocale,
            targetLocale: translation.locale,
            fieldName: input.unit.fieldName,
            assetIds: input.unit.embeddedAssetIds,
            cache: input.localizedAssetCache,
          });
        } catch (error) {
          await createTextRunItem({
            runId: input.runId,
            unit: input.unit,
            locale: translation.locale,
            status: "failed",
            translatedText: translation.text,
            qaFindings: findings,
            error: {
              message: getContentfulAutomationErrorMessage(
                error,
                "contentful_embedded_asset_localization_failed",
              ),
            },
          });
          continue;
        }
      }

      translations.push({
        fieldId: input.unit.fieldId,
        locale: translation.locale,
        value: formatTranslatedValueForContentful({
          sourceValue: input.unit.sourceValue,
          translatedText: translation.text,
          valueKind: input.unit.contentfulValueKind,
          localizedAssetIdsBySourceId,
        }),
      });
    }
    await createTextRunItem({
      runId: input.runId,
      unit: input.unit,
      locale: translation.locale,
      status: hasQaError ? "qa_failed" : "translated",
      translatedText: translation.text,
      qaFindings: findings,
    });
  }

  return {
    translations,
    qaFindings,
    skipped: 0,
  };
}

async function translateImageUnit(input: {
  runId: string;
  unit: ContentfulImageUnit;
  targetLocales: string[];
  client: ContentfulManagementClient;
  localizedAssetCache: LocalizedAssetCache;
}) {
  const existingLocales = new Set(input.unit.existingLocales);
  const targetLocales = input.targetLocales.filter((locale) => !existingLocales.has(locale));
  if (targetLocales.length === 0) {
    return {
      translations: [] as ContentfulDraftTranslation[],
      qaFindings: [] as Array<Record<string, unknown>>,
      skipped: input.targetLocales.length,
    };
  }

  const translations: ContentfulDraftTranslation[] = [];
  for (const locale of targetLocales) {
    try {
      const localizedAssetId = await getLocalizedAssetId({
        client: input.client,
        assetId: input.unit.assetId,
        sourceLocale: input.unit.sourceLocale,
        targetLocale: locale,
        fieldName: input.unit.fieldName,
        cache: input.localizedAssetCache,
      });
      translations.push({
        fieldId: input.unit.fieldId,
        locale,
        value: {
          sys: {
            type: "Link",
            linkType: "Asset",
            id: localizedAssetId,
          },
        },
      });
      await createImageRunItem({
        runId: input.runId,
        unit: input.unit,
        locale,
        status: "translated",
        localizedAssetId,
      });
    } catch (error) {
      const message = getContentfulAutomationErrorMessage(
        error,
        "contentful_image_localization_failed",
      );
      await createImageRunItem({
        runId: input.runId,
        unit: input.unit,
        locale,
        status: "failed",
        error: { message },
      });
    }
  }

  return {
    translations,
    qaFindings: [] as Array<Record<string, unknown>>,
    skipped: 0,
  };
}

async function translateFieldUnit(input: {
  organizationId: string;
  projectId: string;
  projectName: string;
  projectTranslationContext: string;
  runId: string;
  unit: ContentfulTranslatableFieldUnit;
  targetLocales: string[];
  translateStringJob: StringTranslationGenerator;
  runQa: boolean;
  client: ContentfulManagementClient;
  localizedAssetCache: LocalizedAssetCache;
}) {
  if (input.unit.kind === "image") {
    return translateImageUnit({
      runId: input.runId,
      unit: input.unit,
      targetLocales: input.targetLocales,
      client: input.client,
      localizedAssetCache: input.localizedAssetCache,
    });
  }

  return translateTextUnit({
    organizationId: input.organizationId,
    projectId: input.projectId,
    projectName: input.projectName,
    projectTranslationContext: input.projectTranslationContext,
    runId: input.runId,
    unit: input.unit,
    targetLocales: input.targetLocales,
    translateStringJob: input.translateStringJob,
    runQa: input.runQa,
    client: input.client,
    localizedAssetCache: input.localizedAssetCache,
  });
}

export async function createContentfulTranslationRun(input: {
  organizationId: string;
  connectionId: string;
  workspaceAutomationRunId?: string | null;
  webhookEventId?: string | null;
  entryId: string;
  contentTypeId?: string | null;
  sourceLocale: string;
  targetLocales: string[];
  runQa?: boolean;
  writeDrafts?: boolean;
  overwriteDraftLocales?: boolean;
}) {
  const [run] = await db
    .insert(schema.contentfulTranslationRuns)
    .values({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      workspaceAutomationRunId: input.workspaceAutomationRunId ?? null,
      webhookEventId: input.webhookEventId ?? null,
      entryId: input.entryId,
      contentTypeId: input.contentTypeId ?? null,
      sourceLocale: input.sourceLocale,
      targetLocales: input.targetLocales,
      runQa: input.runQa ?? true,
      writeDrafts: input.writeDrafts ?? true,
      overwriteDraftLocales: input.overwriteDraftLocales ?? false,
      status: "queued",
    })
    .returning();

  if (!run) {
    throw new Error("contentful_translation_run_create_failed");
  }

  return run;
}

export async function executeContentfulAutomation(
  input: ContentfulAutomationExecutionEvent,
): Promise<Result<ContentfulAutomationExecutionSuccess, ContentfulAutomationExecutionError>> {
  const [run] = await db
    .select()
    .from(schema.contentfulTranslationRuns)
    .where(
      and(
        eq(schema.contentfulTranslationRuns.id, input.contentfulTranslationRunId),
        eq(schema.contentfulTranslationRuns.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!run) {
    throw new Error("contentful_translation_run_not_found");
  }

  await db
    .update(schema.contentfulTranslationRuns)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.contentfulTranslationRuns.id, run.id));
  await db
    .update(schema.workspaceAutomationRuns)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(schema.workspaceAutomationRuns.id, input.workspaceAutomationRunId),
        eq(schema.workspaceAutomationRuns.organizationId, input.organizationId),
      ),
    );

  try {
    const loaded = await loadContentfulConnectionWithToken({
      organizationId: input.organizationId,
      connectionId: run.connectionId,
    });
    if (!loaded) {
      throw new Error("contentful_connection_not_found");
    }
    if (!loaded.connection.enabled) {
      throw new Error("contentful_connection_disabled");
    }

    const generator = await loadOrganizationOpenAITranslationGenerator(loaded.connection.projectId);
    if (!generator.ok) {
      throw new Error(generator.message);
    }

    const client = new ContentfulManagementClient({
      accessToken: loaded.token,
      spaceId: loaded.connection.spaceId,
      environmentId: loaded.connection.environmentId,
    });
    const targetLocales = resolveContentfulExecutionTargetLocales({
      runTargetLocales: run.targetLocales,
      connectionTargetLocales: loaded.connection.targetLocales,
    });
    const entryResult = await client.getEntry(run.entryId);
    if (isErr(entryResult)) {
      throw entryResult.error;
    }
    const entry = entryResult.value;
    const contentTypeId =
      entry.sys.contentType?.sys?.id ?? run.contentTypeId ?? loaded.connection.contentTypeIds[0];
    if (!contentTypeId) {
      throw new Error("contentful_content_type_not_found");
    }
    const contentTypeResult = await client.getContentType(contentTypeId);
    if (isErr(contentTypeResult)) {
      throw contentTypeResult.error;
    }
    const contentType = contentTypeResult.value;
    const fieldConfig = loaded.connection.fieldConfig as ContentfulConnectionFieldConfig;
    const units = detectContentfulTranslatableFields({
      entry,
      contentType,
      sourceLocale: loaded.connection.sourceLocale,
      targetLocales,
      fieldConfig,
      overwriteDraftLocales: run.overwriteDraftLocales,
    });

    await db
      .update(schema.contentfulTranslationRuns)
      .set({
        contentTypeId,
        detectedFields: units.map((unit) => ({
          fieldId: unit.fieldId,
          fieldName: unit.fieldName,
          key: unit.key,
          kind: unit.kind,
          sourceHash:
            unit.kind === "text" ? sha256(unit.sourceText) : sha256(`asset:${unit.assetId}`),
        })),
        updatedAt: new Date(),
      })
      .where(eq(schema.contentfulTranslationRuns.id, run.id));

    const localizedAssetCache = createLocalizedAssetCache();
    const results = await mapWithConcurrency(
      units,
      MAX_CONCURRENT_CONTENTFUL_TRANSLATIONS,
      async (unit) =>
        translateFieldUnit({
          organizationId: input.organizationId,
          projectId: loaded.connection.projectId,
          projectName: generator.project.name,
          projectTranslationContext: generator.project.translationContext,
          runId: run.id,
          unit,
          targetLocales,
          translateStringJob: generator.translateStringJob,
          runQa: run.runQa,
          client,
          localizedAssetCache,
        }),
    );
    const translations = results.flatMap((result) => result.translations);
    const qaFindings = results.flatMap((result) => result.qaFindings);

    let updatedEntry = entry;
    if (translations.length > 0 && run.writeDrafts !== false) {
      const updatedEntryResult = await client.updateEntryDraft({ entry, translations });
      if (isErr(updatedEntryResult)) {
        throw updatedEntryResult.error;
      }
      updatedEntry = updatedEntryResult.value;
    }
    const completedAt = new Date();
    const qaErrorCount = qaFindings.filter((finding) => finding.severity === "error").length;
    const qaWarningCount = qaFindings.filter((finding) => finding.severity === "warning").length;
    await db
      .update(schema.contentfulTranslationRuns)
      .set({
        status: qaErrorCount > 0 ? "succeeded_with_warnings" : "succeeded",
        qaSummary: {
          total: qaFindings.length,
          errors: qaErrorCount,
          warnings: qaWarningCount,
        },
        writebackSummary: {
          fieldsWritten:
            run.writeDrafts !== false
              ? new Set(translations.map((translation) => translation.fieldId)).size
              : 0,
          localeValuesWritten: run.writeDrafts !== false ? translations.length : 0,
          contentfulVersion:
            translations.length > 0 && run.writeDrafts !== false ? updatedEntry.sys.version : null,
          blockedByQaErrors: qaErrorCount,
        },
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(schema.contentfulTranslationRuns.id, run.id));
    await db
      .update(schema.workspaceAutomationRuns)
      .set({
        status: "succeeded",
        outputSummary: {
          contentfulTranslationRunId: run.id,
          fieldsDetected: units.length,
          localeValuesWritten: translations.length,
          qaFindings: qaFindings.length,
        },
        completedAt,
        updatedAt: completedAt,
      })
      .where(
        and(
          eq(schema.workspaceAutomationRuns.id, input.workspaceAutomationRunId),
          eq(schema.workspaceAutomationRuns.organizationId, input.organizationId),
        ),
      );

    if (run.webhookEventId) {
      await syncContentfulWebhookEventStatus({
        eventId: run.webhookEventId,
        organizationId: input.organizationId,
      });
    }

    return ok({ runId: run.id });
  } catch (error) {
    const completedAt = new Date();
    const message = isContentfulClientError(error)
      ? error.message
      : error instanceof Error
        ? error.message
        : "contentful_automation_failed";
    await db
      .update(schema.contentfulTranslationRuns)
      .set({
        status: "failed",
        error: { message },
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(schema.contentfulTranslationRuns.id, run.id));
    await db
      .update(schema.workspaceAutomationRuns)
      .set({
        status: "failed",
        error: { message },
        completedAt,
        updatedAt: completedAt,
      })
      .where(
        and(
          eq(schema.workspaceAutomationRuns.id, input.workspaceAutomationRunId),
          eq(schema.workspaceAutomationRuns.organizationId, input.organizationId),
        ),
      );
    if (run.webhookEventId) {
      await syncContentfulWebhookEventStatus({
        eventId: run.webhookEventId,
        organizationId: input.organizationId,
        error: { message },
      });
    }
    return err({
      code: "contentful_automation_failed",
      runId: run.id,
      message,
    });
  }
}
