/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { and, eq, inArray } from "drizzle-orm";

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";
import { db, schema } from "@/lib/database/client";
import {
  getLatestRepositorySourceFileVersion,
  getStoredFileContent,
} from "@/lib/file-storage/records";
import { createLogger } from "@/lib/log";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isErr } from "@/lib/primitives/result/results";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import { applySanityTranslationsToDocument } from "./apply-translations";
import type { SanityFieldValue } from "./sanity-field-value";
import { createSanityClient } from "./client";
import { SANITY_PUSH_CONCURRENCY, SANITY_PUSH_STALE_CONFIG } from "./constants";
import {
  createSanityDraftTranslationDocument,
  fetchSanityDocumentById,
  fetchSanityPublishedOrDraftDocument,
  isSameSanityDocumentId,
  patchSanityDraftDocument,
  resolveSanityTranslatedDocumentId,
  upsertSanityTranslationMetadataLink,
} from "./content-api";
import {
  hashSanityTranslationMap,
  parseSanityTranslationMapJson,
  readSanityTranslationMap,
} from "./document-json";
import { extractSanityDocumentSourceMap } from "./extract-source";
import { loadSanityPipesAccessToken } from "./pipes";
import { isSanityLocaleSupportedForDocumentType } from "./locale-catalog";
import { mapProjectLocalesToSanity, normalizeSanityLocaleTag } from "./sanity-locale";
import {
  assertLiveSanityAutomationConfigVersion,
  loadLiveSanityPushSettings,
  withCurrentSanityAutomationConfig,
} from "./sanity-sync-current";
import { isSanityPluginSourcePath } from "./segment-file";
import {
  buildSanityImportScopeKey,
  isSanitySyncStaleConfigError,
  sanityMappingMatchesTarget,
} from "./sanity-sync-scope";

const logger = createLogger("push-sanity-translations");

export type SanityPushSkipReason =
  | "unmapped"
  | "incomplete_translations"
  | "unchanged"
  | "remote_newer"
  | "unsupported_for_type"
  | "source_changed";

export const SANITY_REMOTE_NEWER_SLACK_MS = 5000;
const SANITY_CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function encodeSanityLastPushRecord(hash: string, pushedAt: Date): string {
  return `${hash}:${Math.floor(pushedAt.getTime() / 1000)}`;
}

export function parseSanityLastPushRecord(value: string | undefined): {
  hash: string;
  pushedAt: Date | null;
} {
  if (!value) {
    return { hash: "", pushedAt: null };
  }
  const separatorIndex = value.indexOf(":");
  if (separatorIndex === 64 && SANITY_CONTENT_HASH_PATTERN.test(value.slice(0, 64))) {
    const pushedAtSeconds = Number(value.slice(65));
    if (Number.isFinite(pushedAtSeconds) && pushedAtSeconds > 0) {
      return {
        hash: value.slice(0, 64),
        pushedAt: new Date(pushedAtSeconds * 1000),
      };
    }
    return { hash: value.slice(0, 64), pushedAt: null };
  }
  return { hash: value, pushedAt: null };
}

export function lastPushedAtForSanityLocale(
  mapping: {
    lastPushedAt: Date | null | undefined;
    lastPushContentHash?: Record<string, string> | null;
  },
  locale: string,
): Date | null {
  const parsed = parseSanityLastPushRecord(mapping.lastPushContentHash?.[locale]);
  if (parsed.pushedAt) {
    return parsed.pushedAt;
  }
  return mapping.lastPushedAt ?? null;
}

export type SanityPushSkip = {
  locale: string;
  documentId?: string;
  reason: SanityPushSkipReason;
  message: string;
  translatedKeyCount?: number;
  sourceKeyCount?: number;
};

export type PushSanityTranslationsResult = {
  pushedLocales: number;
  skippedLocales: number;
  failedLocales: number;
  documentsProcessed: number;
  unmappedLocales: string[];
  skipped: SanityPushSkip[];
  summary?: string;
};

export function sanityPushSkipMessage(skip: Omit<SanityPushSkip, "message">): string {
  switch (skip.reason) {
    case "unmapped":
      return `${skip.locale} has no matching Sanity language tag.`;
    case "incomplete_translations":
      return `${skip.locale} is not fully approved (${skip.translatedKeyCount ?? 0} of ${skip.sourceKeyCount ?? 0} keys).`;
    case "unchanged":
      return `${skip.locale} is already pushed and overwrite is off.`;
    case "remote_newer":
      return `${skip.locale} has a newer Sanity draft and overwrite is off.`;
    case "unsupported_for_type":
      return `${skip.locale} is not configured for this Sanity document type.`;
    case "source_changed":
      return "The Sanity source changed after import; re-import before pushing.";
  }
}

export function isSanityImportedSourceCurrent(input: {
  liveSourceHash: string;
  importedSourceHash: string;
}): boolean {
  return input.liveSourceHash === input.importedSourceHash;
}

export function isSanityRemoteDraftNewer(
  remoteUpdatedAt: string | undefined,
  lastPushedAt: Date | null | undefined,
): boolean {
  if (!remoteUpdatedAt || !lastPushedAt) {
    return false;
  }
  const remote = new Date(remoteUpdatedAt);
  if (Number.isNaN(remote.getTime())) {
    return false;
  }
  return remote.getTime() > lastPushedAt.getTime() + SANITY_REMOTE_NEWER_SLACK_MS;
}

function sanityDocumentUpdatedAt(
  doc: { _updatedAt?: SanityFieldValue } | null,
): string | undefined {
  return typeof doc?._updatedAt === "string" ? doc._updatedAt : undefined;
}

export function recordSanityPushSkip(skip: Omit<SanityPushSkip, "message">): SanityPushSkip {
  return { ...skip, message: sanityPushSkipMessage(skip) };
}

export function sourceKeysMissingApprovedTranslations(
  sourceKeys: readonly string[],
  approvedMap: Record<string, string>,
): number {
  return sourceKeys.filter((key) => approvedMap[key] === undefined).length;
}

export function summarizeSanityPushResult(input: {
  pushedLocales: number;
  failedLocales: number;
  skipped: readonly SanityPushSkip[];
  unmappedLocales: readonly string[];
}): string | undefined {
  const reasons = new Set(input.skipped.map((skip) => skip.reason));
  for (const locale of input.unmappedLocales) {
    if (input.skipped.some((skip) => skip.locale === locale && skip.reason === "unmapped")) {
      continue;
    }
    reasons.add("unmapped");
  }

  if (reasons.size === 0) {
    return undefined;
  }

  const skippedLocaleCount =
    input.skipped.length > 0 ? input.skipped.length : input.unmappedLocales.length;
  const localeLabel = skippedLocaleCount === 1 ? "locale" : "locales";

  if (reasons.size === 1 && reasons.has("incomplete_translations")) {
    return `Skipped ${skippedLocaleCount} ${localeLabel} because not every key is approved.`;
  }
  if (reasons.size === 1 && reasons.has("unchanged")) {
    return `Skipped ${skippedLocaleCount} ${localeLabel} because Sanity drafts are already up to date.`;
  }
  if (reasons.size === 1 && reasons.has("remote_newer")) {
    return `Skipped ${skippedLocaleCount} ${localeLabel} because Sanity drafts were updated remotely.`;
  }
  if (reasons.size === 1 && reasons.has("unmapped")) {
    return `Skipped ${skippedLocaleCount} ${localeLabel} with no matching Sanity language tag.`;
  }
  if (reasons.size === 1 && reasons.has("unsupported_for_type")) {
    return `Skipped ${skippedLocaleCount} ${localeLabel} because the document type does not support that language.`;
  }
  if (reasons.size === 1 && reasons.has("source_changed")) {
    return "Skipped because the Sanity source changed after import.";
  }
  return `Skipped ${skippedLocaleCount} ${localeLabel}. See skip reasons for each locale.`;
}

async function persistSanityPushMappingState(input: {
  organizationId: string;
  automationId: string;
  configVersion: number;
  scopeKey: string;
  mappingId: string;
  status: "active" | "push_failed";
  lastError: { message: string } | null;
  lastPushContentHash: Record<string, string>;
  translatedDocumentIds: Record<string, string>;
  lastPushedAt?: Date;
}): Promise<void> {
  await withCurrentSanityAutomationConfig(
    {
      organizationId: input.organizationId,
      automationId: input.automationId,
      configVersion: input.configVersion,
      scopeKey: input.scopeKey,
      staleErrorCode: SANITY_PUSH_STALE_CONFIG,
      compare: "scope",
    },
    async (tx) => {
      await tx
        .update(schema.sanityDocumentSyncStates)
        .set({
          status: input.status,
          lastError: input.lastError,
          lastPushContentHash: input.lastPushContentHash,
          translatedDocumentIds: input.translatedDocumentIds,
          ...(input.lastPushedAt ? { lastPushedAt: input.lastPushedAt } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.sanityDocumentSyncStates.id, input.mappingId));
    },
  );
}

export function readSanityPushSourcePaths(
  inputSnapshot: object | null | undefined,
): string[] | undefined {
  if (!inputSnapshot || !("sourcePaths" in inputSnapshot)) {
    return undefined;
  }
  const raw = (inputSnapshot as { sourcePaths?: SanityFieldValue }).sourcePaths;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
}

export function selectSanityPushMappings<T extends { sourcePath: string }>(
  mappings: T[],
  sourcePaths?: readonly string[],
): T[] {
  if (!sourcePaths) {
    return mappings;
  }
  const selected = new Set(sourcePaths.filter((path) => path.trim().length > 0));
  return mappings.filter((mapping) => selected.has(mapping.sourcePath));
}

export async function runPushSanityTranslations(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  sourcePaths?: string[];
}): Promise<PushSanityTranslationsResult> {
  const sanity = input.automation.toolConfig.sanity;
  if (!sanity?.enabled || !sanity.workosUserId) {
    throw new Error("sanity_not_configured");
  }
  const projectId = input.automation.projectId?.trim();
  const sanityProjectId = sanity.projectId?.trim();
  const dataset = sanity.dataset?.trim();
  if (!projectId || !sanityProjectId || !dataset) {
    throw new Error("sanity_project_required");
  }

  const importScopeKey = buildSanityImportScopeKey({
    nativeProjectId: projectId,
    sanityProjectId,
    dataset,
    documentTypes: sanity.documentTypes,
  });

  await assertLiveSanityAutomationConfigVersion(db, {
    organizationId: input.organizationId,
    automationId: input.automation.id,
    configVersion: input.automation.configVersion,
    scopeKey: importScopeKey,
    staleErrorCode: SANITY_PUSH_STALE_CONFIG,
    compare: "scope",
  });

  const pushSettings = await loadLiveSanityPushSettings(db, {
    organizationId: input.organizationId,
    automationId: input.automation.id,
    scopeKey: importScopeKey,
    staleErrorCode: SANITY_PUSH_STALE_CONFIG,
  });

  const tokenResult = await loadSanityPipesAccessToken({
    localOrganizationId: input.organizationId,
    workosUserId: sanity.workosUserId,
  });
  if (isErr(tokenResult)) {
    throw new Error(tokenResult.error.code);
  }

  const [project] = await db
    .select({
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!project) {
    throw new Error("sanity_native_project_required");
  }

  const sanityLanguages =
    sanity.languages.length > 0
      ? sanity.languages
      : sanity.targetLocales.concat(sanity.sourceLocale);
  const localeMapping = mapProjectLocalesToSanity({
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales: Array.isArray(project.targetLocales)
      ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
      : [],
    intercomLocales: sanityLanguages,
    configuredSourceLocale: sanity.sourceLocale,
    configuredTargetLocales: sanity.targetLocales.length > 0 ? sanity.targetLocales : undefined,
  });

  const client = createSanityClient({
    token: tokenResult.value,
    projectId: sanityProjectId,
    dataset,
    includeDrafts: true,
  });

  const mappings = selectSanityPushMappings(
    (
      await db
        .select()
        .from(schema.sanityDocumentSyncStates)
        .where(
          and(
            eq(schema.sanityDocumentSyncStates.organizationId, input.organizationId),
            eq(schema.sanityDocumentSyncStates.automationId, input.automation.id),
            inArray(schema.sanityDocumentSyncStates.status, ["active", "push_failed"]),
          ),
        )
    ).filter(
      (mapping) =>
        !isSanityPluginSourcePath(mapping.sourcePath) &&
        sanityMappingMatchesTarget(mapping, {
          projectId,
          sanityProjectId,
          dataset,
        }),
    ),
    input.sourcePaths,
  );

  const translationService = new ProjectTranslationService();
  const result: PushSanityTranslationsResult = {
    pushedLocales: 0,
    skippedLocales: 0,
    failedLocales: 0,
    documentsProcessed: 0,
    unmappedLocales: [...localeMapping.unmappedProjectTargets],
    skipped: [],
  };

  await mapWithConcurrency(mappings, SANITY_PUSH_CONCURRENCY, async (mapping) => {
    const lastPushHashes = { ...mapping.lastPushContentHash };
    const translatedDocumentIds = { ...mapping.translatedDocumentIds };
    let pushedForDocument = 0;
    try {
      const latest = await getLatestRepositorySourceFileVersion({
        organizationId: input.organizationId,
        projectId,
        sourcePath: mapping.sourcePath,
      });
      if (!latest?.storedFileId) {
        result.failedLocales += localeMapping.jobTargetLocales.length;
        return;
      }
      const stored = await getStoredFileContent({
        organizationId: input.organizationId,
        projectId,
        fileId: latest.storedFileId,
      });
      const sourceMap = parseSanityTranslationMapJson(stored.content.toString("utf8"));
      const sourceKeys = Object.keys(sourceMap);
      if (sourceKeys.length === 0) {
        return;
      }

      const sourceDoc =
        (await fetchSanityDocumentById(client, mapping.documentId)) ??
        (await fetchSanityDocumentById(client, `drafts.${mapping.documentId}`));
      if (!sourceDoc) {
        result.failedLocales += localeMapping.jobTargetLocales.length;
        return;
      }

      const sourceSanityLocale = mapping.sourceLocale || localeMapping.sourceIntercomLocale || "";
      const liveSourceHash = hashSanityTranslationMap(
        extractSanityDocumentSourceMap({
          document: sourceDoc,
          i18nMode: mapping.i18nMode,
          sourceSanityLocale,
        }),
      );
      if (
        !isSanityImportedSourceCurrent({
          liveSourceHash,
          importedSourceHash: mapping.sourceContentHash,
        })
      ) {
        result.skipped.push(
          recordSanityPushSkip({
            locale: sourceSanityLocale || mapping.sourceLocale,
            documentId: mapping.documentId,
            reason: "source_changed",
          }),
        );
        result.skippedLocales += 1;
        return;
      }
      let fieldLevelDocument = sourceDoc;

      for (let index = 0; index < localeMapping.jobTargetLocales.length; index += 1) {
        const projectLocale = localeMapping.jobTargetLocales[index]!;
        const sanityLocale = localeMapping.intercomTargetLocales[index];
        if (!sanityLocale) {
          result.skipped.push(
            recordSanityPushSkip({
              locale: projectLocale,
              documentId: mapping.documentId,
              reason: "unmapped",
            }),
          );
          result.skippedLocales += 1;
          continue;
        }
        if (
          !isSanityLocaleSupportedForDocumentType({
            sanityLocale,
            documentType: mapping.documentType,
            languagesByType: sanity.languagesByType ?? {},
            fallbackLanguages: sanityLanguages,
          })
        ) {
          result.skipped.push(
            recordSanityPushSkip({
              locale: projectLocale,
              documentId: mapping.documentId,
              reason: "unsupported_for_type",
            }),
          );
          result.skippedLocales += 1;
          continue;
        }
        if (
          sourceSanityLocale &&
          normalizeSanityLocaleTag(sanityLocale) === normalizeSanityLocaleTag(sourceSanityLocale)
        ) {
          continue;
        }

        const approved = await translationService.loadAsPrefilledEntries({
          organizationId: input.organizationId,
          projectId,
          sourcePath: mapping.sourcePath,
          targetLocale: projectLocale,
          approvedTranslationsOnly: true,
          readyTranslationsOnly: true,
        });
        const approvedMap = readSanityTranslationMap(approved.prefilled);
        const missingKeyCount = sourceKeysMissingApprovedTranslations(sourceKeys, approvedMap);
        if (missingKeyCount > 0) {
          result.skipped.push(
            recordSanityPushSkip({
              locale: projectLocale,
              documentId: mapping.documentId,
              reason: "incomplete_translations",
              translatedKeyCount: sourceKeys.length - missingKeyCount,
              sourceKeyCount: sourceKeys.length,
            }),
          );
          result.skippedLocales += 1;
          continue;
        }

        const contentHash = hashSanityTranslationMap(approvedMap);
        const previousPush = parseSanityLastPushRecord(lastPushHashes[projectLocale]);
        if (previousPush.hash === contentHash && !pushSettings.overwriteSanityDrafts) {
          result.skipped.push(
            recordSanityPushSkip({
              locale: projectLocale,
              documentId: mapping.documentId,
              reason: "unchanged",
            }),
          );
          result.skippedLocales += 1;
          continue;
        }

        if (!pushSettings.overwriteSanityDrafts) {
          let remoteUpdatedAt = sanityDocumentUpdatedAt(sourceDoc);
          if (mapping.i18nMode === "document") {
            const targetId = resolveSanityTranslatedDocumentId(translatedDocumentIds, sanityLocale);
            if (targetId && !isSameSanityDocumentId(targetId, mapping.documentId)) {
              const remoteTarget = await fetchSanityPublishedOrDraftDocument(client, targetId);
              remoteUpdatedAt = sanityDocumentUpdatedAt(remoteTarget);
            } else {
              remoteUpdatedAt = undefined;
            }
          }
          if (
            isSanityRemoteDraftNewer(
              remoteUpdatedAt,
              lastPushedAtForSanityLocale(
                {
                  lastPushedAt: mapping.lastPushedAt,
                  lastPushContentHash: lastPushHashes,
                },
                projectLocale,
              ),
            )
          ) {
            result.skipped.push(
              recordSanityPushSkip({
                locale: projectLocale,
                documentId: mapping.documentId,
                reason: "remote_newer",
              }),
            );
            result.skippedLocales += 1;
            continue;
          }
        }

        if (mapping.i18nMode === "field") {
          fieldLevelDocument = applySanityTranslationsToDocument({
            document: fieldLevelDocument,
            i18nMode: "field",
            targetSanityLocale: sanityLocale,
            sourceSanityLocale,
            translations: approvedMap,
          });
          await patchSanityDraftDocument({
            client,
            publishedDocumentId: mapping.documentId,
            document: fieldLevelDocument,
          });
        } else {
          const nextDoc = applySanityTranslationsToDocument({
            document: sourceDoc,
            i18nMode: "document",
            targetSanityLocale: sanityLocale,
            translations: approvedMap,
          });
          const translatedPayload = {
            ...nextDoc,
            _type: mapping.documentType,
            language: sanityLocale,
          };
          let targetId = resolveSanityTranslatedDocumentId(translatedDocumentIds, sanityLocale);
          if (targetId && isSameSanityDocumentId(targetId, mapping.documentId)) {
            targetId = undefined;
          }

          if (!targetId) {
            targetId = await createSanityDraftTranslationDocument({
              client,
              document: translatedPayload,
            });
            await upsertSanityTranslationMetadataLink({
              client,
              sourceDocumentId: mapping.documentId,
              sourceLocale: sourceSanityLocale,
              targetLocale: sanityLocale,
              targetDocumentId: targetId,
              documentType: mapping.documentType,
            });
            translatedDocumentIds[sanityLocale] = targetId;
          } else {
            await patchSanityDraftDocument({
              client,
              publishedDocumentId: targetId,
              document: translatedPayload,
            });
          }
        }

        const pushedAt = new Date();
        lastPushHashes[projectLocale] = encodeSanityLastPushRecord(contentHash, pushedAt);
        result.pushedLocales += 1;
        pushedForDocument += 1;
        await persistSanityPushMappingState({
          organizationId: input.organizationId,
          automationId: input.automation.id,
          configVersion: input.automation.configVersion,
          scopeKey: importScopeKey,
          mappingId: mapping.id,
          status: "active",
          lastError: null,
          lastPushContentHash: lastPushHashes,
          translatedDocumentIds,
          lastPushedAt: pushedAt,
        });
      }

      if (pushedForDocument > 0) {
        result.documentsProcessed += 1;
      }

      await persistSanityPushMappingState({
        organizationId: input.organizationId,
        automationId: input.automation.id,
        configVersion: input.automation.configVersion,
        scopeKey: importScopeKey,
        mappingId: mapping.id,
        status: "active",
        lastError: null,
        lastPushContentHash: lastPushHashes,
        translatedDocumentIds,
        lastPushedAt: pushedForDocument > 0 ? new Date() : undefined,
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && isSanitySyncStaleConfigError(error)) {
        throw error;
      }
      logger.warn({ error, mappingId: mapping.id }, "sanity_push_failed");
      await db
        .update(schema.sanityDocumentSyncStates)
        .set({
          status: "push_failed",
          lastError: {
            message: error instanceof Error ? error.message : "sanity_push_failed",
          },
          lastPushContentHash: lastPushHashes,
          translatedDocumentIds,
          ...(pushedForDocument > 0 ? { lastPushedAt: new Date() } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.sanityDocumentSyncStates.id, mapping.id));
      result.failedLocales += 1;
    }
  });

  result.skippedLocales = result.skipped.length;
  result.summary = summarizeSanityPushResult(result);
  return result;
}
