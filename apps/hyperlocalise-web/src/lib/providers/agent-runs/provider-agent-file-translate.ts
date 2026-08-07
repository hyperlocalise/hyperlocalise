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
import {
  detectAgentRunProposalWarnings,
  deriveChangedFields,
  buildAgentRunProposalItemId,
  serializeAgentRunProposalItem,
  type AgentRunProposalItem,
} from "@/lib/providers/agent-runs/agent-run-proposals";
import {
  loadProviderCrowdinDownloadContext,
  resolveProviderSourceFileDownload,
} from "@/lib/providers/jobs/download-provider-source-file";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";
import type {
  ExternalTmsTaskContent,
  ExternalTmsTranslationUnit,
} from "@/lib/providers/jobs/tms-provider-types";
import {
  sourceContainsTerm,
  validateGlossaryTermsInTranslation,
} from "@/lib/glossary/validate-glossary-terms-in-translation";
import { reuseFileTranslationMemoryEntries } from "@/lib/translation/file-memory";
import type { SandboxTranslationContext } from "@/lib/translation/domain";
import type { ExternalTmsProviderKind } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import { createLogger } from "@/lib/log";
import { loadTranslationContextProject } from "@/lib/translation/context";

const logger = createLogger("provider-agent-file-translate");

type ProviderSourceFileRef = {
  id: string;
  displayName: string;
  sourcePath: string | null;
};

async function loadFileGlossaryTerms(input: {
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  sourceText: string;
}) {
  const { and, asc, eq, inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/database");

  const attachedTerms = await db
    .select({
      sourceTerm: schema.glossaryTerms.sourceTerm,
      targetTerm: schema.glossaryTerms.targetTerm,
      targetLocale: schema.glossaries.targetLocale,
      description: schema.glossaryTerms.description,
      forbidden: schema.glossaryTerms.forbidden,
      caseSensitive: schema.glossaryTerms.caseSensitive,
      priority: schema.projectGlossaries.priority,
    })
    .from(schema.projectGlossaries)
    .innerJoin(schema.glossaries, eq(schema.glossaries.id, schema.projectGlossaries.glossaryId))
    .innerJoin(schema.glossaryTerms, eq(schema.glossaryTerms.glossaryId, schema.glossaries.id))
    .where(
      and(
        eq(schema.projectGlossaries.projectId, input.projectId),
        eq(schema.glossaries.sourceLocale, input.sourceLocale),
        inArray(schema.glossaries.targetLocale, input.targetLocales),
        eq(schema.glossaries.status, "active"),
        eq(schema.glossaryTerms.reviewStatus, "approved"),
      ),
    )
    .orderBy(asc(schema.projectGlossaries.priority), asc(schema.glossaryTerms.sourceTerm))
    .limit(500);

  return attachedTerms
    .filter((term) => sourceContainsTerm(input.sourceText, term))
    .slice(0, 50)
    .map(({ sourceTerm, targetTerm, targetLocale, description, forbidden, caseSensitive }) => ({
      sourceTerm,
      targetTerm,
      targetLocale,
      description,
      forbidden,
      caseSensitive,
    }));
}

export type ProviderAgentFileTranslationResult = {
  changedItems: AgentRunProposalItem[];
  warnings: string[];
  unitsProcessed: number;
  skippedExistingLocales: number;
  filesProcessed: number;
};

function shellSingleQuote(value: string) {
  return value.replaceAll("'", "'\\''");
}

function sanitizeSandboxFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function existingTranslationForLocale(unit: ExternalTmsTranslationUnit, locale: string) {
  return unit.translations.find((translation) => translation.locale === locale) ?? null;
}

function shouldSkipExistingTranslation(
  translation: ExternalTmsTranslationUnit["translations"][number] | null,
) {
  return Boolean(translation?.text?.trim());
}

function unitsForFile(units: ExternalTmsTranslationUnit[], externalFileId: string) {
  return units.filter((unit) => unit.fileId === externalFileId);
}

/** True when every unit already has a non-empty translation for every target locale. */
export function isProviderFileFullyTranslated(input: {
  units: ExternalTmsTranslationUnit[];
  targetLocales: string[];
}): boolean {
  if (input.units.length === 0 || input.targetLocales.length === 0) {
    return true;
  }

  for (const targetLocale of input.targetLocales) {
    for (const unit of input.units) {
      const existing = existingTranslationForLocale(unit, targetLocale);
      if (!shouldSkipExistingTranslation(existing)) {
        return false;
      }
    }
  }

  return true;
}

function countExistingTranslationsForFile(
  units: ExternalTmsTranslationUnit[],
  targetLocales: string[],
): number {
  let count = 0;
  for (const targetLocale of targetLocales) {
    for (const unit of units) {
      if (shouldSkipExistingTranslation(existingTranslationForLocale(unit, targetLocale))) {
        count += 1;
      }
    }
  }
  return count;
}

export function summarizeProviderUnitFileIds(units: ExternalTmsTranslationUnit[]) {
  const countsByFileId = new Map<string, number>();
  for (const unit of units) {
    const fileId = unit.fileId?.trim() ? unit.fileId : "(null)";
    countsByFileId.set(fileId, (countsByFileId.get(fileId) ?? 0) + 1);
  }

  return Object.fromEntries(countsByFileId);
}

function buildPrefilledEntriesForLocale(input: {
  units: ExternalTmsTranslationUnit[];
  targetLocale: string;
}) {
  const prefilled: Record<string, string> = {};
  for (const unit of input.units) {
    const existing = existingTranslationForLocale(unit, input.targetLocale);
    if (!existing?.text?.trim()) {
      continue;
    }
    prefilled[unit.key] = existing.text;
  }
  return prefilled;
}

function buildGlossaryContext(input: {
  sourceText: string;
  projectName: string;
  projectTranslationContext: string;
  glossaryTerms: SandboxTranslationContext["glossaryTerms"];
  targetLocales: string[];
}): SandboxTranslationContext {
  const attachedTerms = (input.glossaryTerms ?? []).filter((term) =>
    sourceContainsTerm(input.sourceText, {
      sourceTerm: term.sourceTerm,
      caseSensitive: term.caseSensitive ?? false,
    }),
  );

  const targetLocaleSet = new Set(input.targetLocales);
  return {
    projectName: input.projectName,
    projectTranslationContext: input.projectTranslationContext,
    glossaryTerms: attachedTerms
      .filter((term) => targetLocaleSet.has(term.targetLocale))
      .slice(0, 50),
  };
}

function sandboxWorkFilename(fileId: string, basename: string): string {
  return `work_${sanitizeSandboxFilename(fileId)}_${sanitizeSandboxFilename(basename)}`;
}

/**
 * Merge per-file prefills for a single `hl run`. The CLI matches locale-keyed prefills on locale and
 * entry key alone, so an entry key that more than one file in the batch owns is dropped instead of
 * leaking one file's translation into another file that happens to reuse the same key.
 */
export function mergeLocaleKeyedPrefills(
  filePrefills: Array<{
    entryKeys: Iterable<string>;
    prefillsByLocale: Record<string, Record<string, string>>;
  }>,
): Record<string, Record<string, string>> {
  const ownedKeysPerFile = filePrefills.map((file) => {
    const owned = new Set(file.entryKeys);
    for (const entries of Object.values(file.prefillsByLocale)) {
      for (const key of Object.keys(entries)) {
        owned.add(key);
      }
    }
    return owned;
  });

  const fileCountByEntryKey = new Map<string, number>();
  for (const owned of ownedKeysPerFile) {
    for (const key of owned) {
      fileCountByEntryKey.set(key, (fileCountByEntryKey.get(key) ?? 0) + 1);
    }
  }

  const merged: Record<string, Record<string, string>> = {};
  for (const file of filePrefills) {
    for (const [locale, entries] of Object.entries(file.prefillsByLocale)) {
      const localeMap = (merged[locale] ??= {});
      for (const [key, value] of Object.entries(entries)) {
        if ((fileCountByEntryKey.get(key) ?? 0) > 1) {
          continue;
        }
        localeMap[key] = value;
      }
    }
  }

  return merged;
}

async function runMultiFileTranslationInSandbox(input: {
  sandboxId: string;
  files: Array<{ from: string; to: string }>;
  sourceLocale: string;
  targetLocales: string[];
  context: SandboxTranslationContext;
  prefilledByLocale: Record<string, Record<string, string>>;
}) {
  const {
    buildMultiFileMultiLocaleTempConfig,
    getSandboxTranslationEnv,
    runSandboxCommand,
    sandboxI18nConfigPath,
    writeFileToSandbox,
    writeTempConfig,
  } = await import("@/lib/translation/sandbox");

  const config = buildMultiFileMultiLocaleTempConfig(
    input.files,
    input.sourceLocale,
    input.targetLocales,
    null,
    input.context,
  );
  await writeTempConfig(input.sandboxId, config, sandboxI18nConfigPath);

  let prefilledFlags = "";
  const localesWithPrefill = Object.entries(input.prefilledByLocale).filter(
    ([, entries]) => Object.keys(entries).length > 0,
  );
  if (localesWithPrefill.length > 0) {
    const nested: Record<string, Record<string, string>> = {};
    for (const [locale, entries] of localesWithPrefill) {
      nested[locale] = entries;
    }
    const prefilledPath = "/tmp/prefilled-by-locale.json";
    await writeFileToSandbox(
      input.sandboxId,
      prefilledPath,
      Buffer.from(JSON.stringify(nested), "utf8"),
    );
    prefilledFlags = ` --prefilled-entries '${shellSingleQuote(prefilledPath)}'`;
  }

  const localeFlags = input.targetLocales
    .map((locale) => `--locale '${shellSingleQuote(locale)}'`)
    .join(" ");

  const translation = await runSandboxCommand(
    input.sandboxId,
    "bash",
    [
      "-lc",
      `hl run --config '${shellSingleQuote(sandboxI18nConfigPath)}' ${localeFlags} --force --progress off${prefilledFlags}`,
    ],
    { env: getSandboxTranslationEnv() },
  );

  if (translation.exitCode !== 0) {
    throw new Error(`translation failed: ${translation.output}`);
  }
}

export function shouldUseProviderFileTranslation(input: { sourceFiles: ProviderSourceFileRef[] }) {
  return input.sourceFiles.some((file) => Boolean(file.sourcePath?.trim()));
}

export async function translateProviderJobFiles(input: {
  agentRunId?: string;
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  content: ExternalTmsTaskContent;
  sourceFiles: ProviderSourceFileRef[];
  actorUserId?: string | null;
  targetLocales?: string[];
}): Promise<ProviderAgentFileTranslationResult> {
  const logContext = {
    agentRunId: input.agentRunId,
    organizationId: input.organizationId,
    providerKind: input.providerKind,
  };
  const unitFileIdCounts = summarizeProviderUnitFileIds(input.content.units);

  const project = await loadTranslationContextProject(input.projectId);
  if (!project) {
    logger.warn(
      {
        ...logContext,
        projectId: input.projectId,
        reason: "translation_project_not_found",
      },
      "provider agent file translation aborted because translation project was not found",
    );
    return {
      changedItems: [],
      warnings: [`Translation project ${input.projectId} was not found`],
      unitsProcessed: 0,
      skippedExistingLocales: 0,
      filesProcessed: 0,
    };
  }

  const sourceLocale = input.content.sourceLocale ?? "en";
  const targetLocales =
    input.targetLocales && input.targetLocales.length > 0
      ? input.content.targetLocales.filter((locale) => input.targetLocales!.includes(locale))
      : input.content.targetLocales;

  const changedItems: AgentRunProposalItem[] = [];
  const warnings: string[] = [];
  let unitsProcessed = 0;
  let skippedExistingLocales = 0;
  let filesProcessed = 0;
  let skippedMissingSourcePathCount = 0;
  let skippedNoMatchingUnitsCount = 0;
  let skippedFullyTranslatedCount = 0;
  let skippedDownloadFailureCount = 0;

  logger.info(
    {
      ...logContext,
      unitCount: input.content.units.length,
      targetLocaleCount: targetLocales.length,
      targetLocales,
      sourceLocale,
      sourceFileCount: input.sourceFiles.length,
      sourceFilesWithPathCount: input.sourceFiles.filter((file) => Boolean(file.sourcePath?.trim()))
        .length,
      sourceFileIds: input.sourceFiles.map((file) => ({
        id: file.id,
        hasSourcePath: Boolean(file.sourcePath?.trim()),
      })),
      unitFileIdCounts,
    },
    "provider agent file translation started",
  );

  const crowdinContext =
    input.providerKind === "crowdin"
      ? await loadProviderCrowdinDownloadContext({
          organizationId: input.organizationId,
          projectId: input.projectId,
          providerKind: input.providerKind,
          actorUserId: input.actorUserId,
        })
      : null;

  type PendingFileWork = {
    sourceFile: ProviderSourceFileRef;
    fileUnits: ExternalTmsTranslationUnit[];
    inputFilename: string;
    downloadUrl: string | null;
  };

  const pendingFiles: PendingFileWork[] = [];

  for (const sourceFile of input.sourceFiles) {
    if (!sourceFile.sourcePath?.trim()) {
      skippedMissingSourcePathCount += 1;
      logger.info(
        {
          ...logContext,
          sourceFileId: sourceFile.id,
          displayName: sourceFile.displayName,
          reason: "missing_source_path",
        },
        "provider agent file translation skipped source file without source path",
      );
      continue;
    }

    const fileUnits = unitsForFile(input.content.units, sourceFile.id);
    if (fileUnits.length === 0) {
      skippedNoMatchingUnitsCount += 1;
      logger.warn(
        {
          ...logContext,
          sourceFileId: sourceFile.id,
          displayName: sourceFile.displayName,
          sourcePath: sourceFile.sourcePath,
          unitCount: input.content.units.length,
          unitFileIdCounts,
          reason: "no_units_for_file",
        },
        "provider agent file translation skipped source file with no matching units",
      );
      continue;
    }

    if (isProviderFileFullyTranslated({ units: fileUnits, targetLocales })) {
      const existingCount = countExistingTranslationsForFile(fileUnits, targetLocales);
      skippedExistingLocales += existingCount;
      skippedFullyTranslatedCount += 1;
      logger.info(
        {
          ...logContext,
          sourceFileId: sourceFile.id,
          displayName: sourceFile.displayName,
          sourcePath: sourceFile.sourcePath,
          matchingUnitCount: fileUnits.length,
          targetLocaleCount: targetLocales.length,
          skippedExistingLocales: existingCount,
          reason: "file_fully_translated",
        },
        "provider agent file translation skipped fully translated source file before sandbox",
      );
      continue;
    }

    const inputFilename = sanitizeSandboxFilename(
      sourceFile.sourcePath.split("/").pop() ?? `source-${sourceFile.id}`,
    );
    const fileFormat = inferSupportedFileTranslationFileFormat(sourceFile.sourcePath);
    if (!fileFormat) {
      skippedDownloadFailureCount += 1;
      warnings.push(
        `Skipped file ${sourceFile.displayName ?? sourceFile.id}: Source path ${sourceFile.sourcePath} is not a supported translation file format`,
      );
      continue;
    }

    if (crowdinContext && !crowdinContext.ok) {
      skippedDownloadFailureCount += 1;
      logger.warn(
        {
          ...logContext,
          sourceFileId: sourceFile.id,
          displayName: sourceFile.displayName,
          sourcePath: sourceFile.sourcePath,
          downloadCode: crowdinContext.code,
          matchingUnitCount: fileUnits.length,
          reason: "source_file_download_failed",
        },
        "provider agent file translation skipped source file after download failure",
      );
      warnings.push(
        `Skipped file ${sourceFile.displayName ?? sourceFile.id}: ${crowdinContext.message}`,
      );
      continue;
    }

    const resolvedDownload =
      input.providerKind !== "crowdin"
        ? await resolveProviderSourceFileDownload({
            organizationId: input.organizationId,
            projectId: input.projectId,
            providerKind: input.providerKind,
            externalFileId: sourceFile.id,
            sourcePath: sourceFile.sourcePath,
            actorUserId: input.actorUserId,
          })
        : null;
    if (resolvedDownload && !resolvedDownload.ok) {
      skippedDownloadFailureCount += 1;
      logger.warn(
        {
          ...logContext,
          sourceFileId: sourceFile.id,
          displayName: sourceFile.displayName,
          sourcePath: sourceFile.sourcePath,
          downloadCode: resolvedDownload.code,
          matchingUnitCount: fileUnits.length,
          reason: "source_file_download_failed",
        },
        "provider agent file translation skipped source file after download failure",
      );
      warnings.push(
        `Skipped file ${sourceFile.displayName ?? sourceFile.id}: ${resolvedDownload.message}`,
      );
      continue;
    }

    pendingFiles.push({
      sourceFile,
      fileUnits,
      inputFilename,
      downloadUrl: resolvedDownload?.ok ? resolvedDownload.downloadUrl : null,
    });
  }

  if (pendingFiles.length > 0) {
    const {
      buildCrowdinMultiFileSandboxConfig,
      createTranslationSandbox,
      downloadAttachment,
      downloadCrowdinSourceInSandbox,
      downloadCrowdinTranslationsInSandbox,
      extractSandboxEntries,
      getOutputFilename,
      getOutputFilenamePattern,
      prepareSandbox,
      readTranslatedFile,
      stopTranslationSandbox,
      writeFileToSandbox,
    } = await import("@/lib/translation/sandbox");

    type PreparedFile = {
      sourceFile: ProviderSourceFileRef;
      fileUnits: ExternalTmsTranslationUnit[];
      workFilename: string;
      outputPattern: string;
      sourceText: string;
      sourceEntries: Record<string, string> | null;
      localesNeedingByLocale: Map<string, ExternalTmsTranslationUnit[]>;
    };

    const { sandboxId } = await createTranslationSandbox();
    try {
      await prepareSandbox(sandboxId);

      const preparedFiles: PreparedFile[] = [];

      for (const pending of pendingFiles) {
        const { sourceFile, fileUnits, inputFilename, downloadUrl } = pending;
        const workFilename = sandboxWorkFilename(sourceFile.id, inputFilename);

        try {
          if (crowdinContext?.ok) {
            await downloadCrowdinSourceInSandbox({
              sandboxId,
              externalFileId: sourceFile.id,
              sourceFilename: workFilename,
              externalProjectId: crowdinContext.externalProjectId,
              secretMaterial: crowdinContext.secretMaterial,
              baseUrl: crowdinContext.baseUrl,
            });
          } else if (downloadUrl) {
            await downloadAttachment(sandboxId, downloadUrl, workFilename);
          }

          const sourceContent = await readTranslatedFile(sandboxId, workFilename);
          const sourceText = sourceContent.toString("utf8");
          let sourceEntries: Record<string, string> | null = null;

          filesProcessed += 1;
          logger.info(
            {
              ...logContext,
              sourceFileId: sourceFile.id,
              displayName: sourceFile.displayName,
              sourcePath: sourceFile.sourcePath,
              matchingUnitCount: fileUnits.length,
              byteLength: sourceContent.byteLength,
              sandboxId,
              workFilename,
              downloadMethod: crowdinContext?.ok ? "hl-crowdin-download-sources" : "curl",
            },
            "provider agent file translation downloaded source file in sandbox",
          );

          try {
            const extracted = await extractSandboxEntries(sandboxId, workFilename);
            if (extracted.ok) {
              sourceEntries = extracted.entries;
            } else {
              warnings.push(
                `Could not extract entries for ${sourceFile.displayName ?? sourceFile.id}: exitCode=${extracted.exitCode}`,
              );
            }
          } catch (error) {
            warnings.push(
              `Could not extract entries for ${sourceFile.displayName ?? sourceFile.id}: ${
                error instanceof Error ? error.message : "unknown error"
              }`,
            );
          }

          const localesNeedingByLocale = new Map<string, ExternalTmsTranslationUnit[]>();
          for (const targetLocale of targetLocales) {
            const localesNeedingTranslation = fileUnits.filter((unit) => {
              const existing = existingTranslationForLocale(unit, targetLocale);
              if (shouldSkipExistingTranslation(existing)) {
                skippedExistingLocales += 1;
                return false;
              }
              return true;
            });
            unitsProcessed += localesNeedingTranslation.length;
            if (localesNeedingTranslation.length > 0) {
              localesNeedingByLocale.set(targetLocale, localesNeedingTranslation);
            }
          }

          if (localesNeedingByLocale.size === 0) {
            continue;
          }

          preparedFiles.push({
            sourceFile,
            fileUnits,
            workFilename,
            outputPattern: getOutputFilenamePattern(workFilename),
            sourceText,
            sourceEntries,
            localesNeedingByLocale,
          });
        } catch (error) {
          skippedDownloadFailureCount += 1;
          logger.warn(
            {
              ...logContext,
              sourceFileId: sourceFile.id,
              displayName: sourceFile.displayName,
              sourcePath: sourceFile.sourcePath,
              matchingUnitCount: fileUnits.length,
              sandboxId,
              reason: "sandbox_source_file_download_failed",
              err: error instanceof Error ? error.message : "unknown error",
            },
            "provider agent file translation skipped source file after sandbox download failure",
          );
          warnings.push(
            `Skipped file ${sourceFile.displayName ?? sourceFile.id}: ${
              error instanceof Error ? error.message : "sandbox download failed"
            }`,
          );
        }
      }

      if (preparedFiles.length > 0) {
        const localesToRun = [
          ...new Set(preparedFiles.flatMap((file) => [...file.localesNeedingByLocale.keys()])),
        ].toSorted();

        const combinedSourceText = preparedFiles.map((file) => file.sourceText).join("\n");
        const glossaryTerms = await loadFileGlossaryTerms({
          projectId: input.projectId,
          sourceLocale,
          targetLocales: localesToRun,
          sourceText: combinedSourceText,
        });
        const batchContext = buildGlossaryContext({
          sourceText: combinedSourceText,
          projectName: project.name,
          projectTranslationContext: project.translationContext,
          glossaryTerms,
          targetLocales: localesToRun,
        });

        const filePrefills: Array<Record<string, Record<string, string>>> = [];
        for (const prepared of preparedFiles) {
          const byLocale: Record<string, Record<string, string>> = {};
          for (const targetLocale of localesToRun) {
            const existingPrefilled = buildPrefilledEntriesForLocale({
              units: prepared.fileUnits,
              targetLocale,
            });
            let tmPrefilled: Record<string, string> = {};
            if (prepared.sourceEntries) {
              tmPrefilled = await reuseFileTranslationMemoryEntries({
                projectId: input.projectId,
                sourceLocale,
                targetLocale,
                sourceEntries: prepared.sourceEntries,
              });
            }
            byLocale[targetLocale] = { ...tmPrefilled, ...existingPrefilled };
          }
          filePrefills.push(byLocale);
        }

        if (crowdinContext?.ok) {
          const crowdinConfig = buildCrowdinMultiFileSandboxConfig({
            sourceFilenames: preparedFiles.map((file) => file.workFilename),
            includeBaseUrl: Boolean(crowdinContext.baseUrl?.trim()),
          });
          await writeFileToSandbox(
            sandboxId,
            "/tmp/crowdin.yml",
            Buffer.from(crowdinConfig, "utf8"),
          );

          for (const targetLocale of localesToRun) {
            const downloadResult = await downloadCrowdinTranslationsInSandbox({
              sandboxId,
              targetLocale,
              externalProjectId: crowdinContext.externalProjectId,
              secretMaterial: crowdinContext.secretMaterial,
              baseUrl: crowdinContext.baseUrl,
              mergeApproved: true,
            });
            if (!downloadResult.ok) {
              continue;
            }

            for (let index = 0; index < preparedFiles.length; index += 1) {
              const prepared = preparedFiles[index]!;
              const outputFilename = getOutputFilename(prepared.workFilename, targetLocale);
              const crowdinEntries = await extractSandboxEntries(sandboxId, outputFilename);
              if (!crowdinEntries.ok) {
                continue;
              }
              // Existing/TM prefill wins over Crowdin prefill for the same key.
              filePrefills[index]![targetLocale] = {
                ...crowdinEntries.entries,
                ...filePrefills[index]![targetLocale],
              };
            }
          }
        }

        const prefilledByLocale = mergeLocaleKeyedPrefills(
          preparedFiles.map((prepared, index) => ({
            entryKeys: [
              ...prepared.fileUnits.map((unit) => unit.key),
              ...Object.keys(prepared.sourceEntries ?? {}),
            ],
            prefillsByLocale: filePrefills[index]!,
          })),
        );

        let batchFailed = false;
        try {
          await runMultiFileTranslationInSandbox({
            sandboxId,
            files: preparedFiles.map((file) => ({
              from: file.workFilename,
              to: file.outputPattern,
            })),
            sourceLocale,
            targetLocales: localesToRun,
            context: batchContext,
            prefilledByLocale,
          });
        } catch (error) {
          batchFailed = true;
          warnings.push(
            `Batch file translation failed: ${
              error instanceof Error ? error.message : "unknown error"
            }`,
          );
        }

        if (!batchFailed) {
          const glossaryTermsForValidation = (batchContext.glossaryTerms ?? []).map((term) => ({
            sourceTerm: term.sourceTerm,
            targetTerm: term.targetTerm,
            targetLocale: term.targetLocale,
            forbidden: term.forbidden ?? null,
            caseSensitive: term.caseSensitive ?? null,
          }));

          for (const prepared of preparedFiles) {
            for (const [
              targetLocale,
              localesNeedingTranslation,
            ] of prepared.localesNeedingByLocale) {
              const outputFilename = getOutputFilename(prepared.workFilename, targetLocale);
              try {
                const translatedContent = await readTranslatedFile(sandboxId, outputFilename);
                const translatedText = translatedContent.toString("utf8");
                const translatedEntriesResult = await extractSandboxEntries(
                  sandboxId,
                  outputFilename,
                );
                if (!translatedEntriesResult.ok) {
                  warnings.push(
                    `Failed to extract translations for ${prepared.sourceFile.displayName ?? prepared.sourceFile.id} (${targetLocale})`,
                  );
                  continue;
                }
                const translatedEntries = translatedEntriesResult.entries;

                const glossaryFailures = validateGlossaryTermsInTranslation({
                  sourceText: prepared.sourceText,
                  translatedText,
                  terms: glossaryTermsForValidation.filter(
                    (term) => term.targetLocale === targetLocale,
                  ),
                });
                if (glossaryFailures.length > 0) {
                  warnings.push(
                    `Glossary validation failed for ${prepared.sourceFile.displayName ?? prepared.sourceFile.id} (${targetLocale})`,
                  );
                }

                for (const unit of localesNeedingTranslation) {
                  const existing = existingTranslationForLocale(unit, targetLocale);
                  const from = existing?.text ?? "";
                  const to = translatedEntries[unit.key] ?? from;
                  if (!to.trim() || to === from) {
                    continue;
                  }

                  const proposalWarnings = detectAgentRunProposalWarnings({
                    sourceText: unit.sourceText,
                    from,
                    to,
                    locale: targetLocale,
                    externalStringId: unit.externalStringId,
                    key: unit.key,
                    glossaryTerms: glossaryTermsForValidation
                      .filter((term) => term.targetLocale === targetLocale)
                      .map((term) => ({
                        sourceTerm: term.sourceTerm,
                        targetTerm: term.targetTerm,
                        targetLocale: term.targetLocale,
                        forbidden: term.forbidden,
                        caseSensitive: term.caseSensitive,
                      })),
                  });

                  changedItems.push(
                    serializeAgentRunProposalItem({
                      itemId: buildAgentRunProposalItemId({
                        externalStringId: unit.externalStringId,
                        locale: targetLocale,
                      }),
                      externalStringId: unit.externalStringId,
                      key: unit.key,
                      locale: targetLocale,
                      sourceText: unit.sourceText,
                      from,
                      to,
                      reviewState: "pending",
                      changedFields: deriveChangedFields(from, to),
                      warnings: proposalWarnings,
                    }),
                  );
                }
              } catch (error) {
                warnings.push(
                  `File translation failed for ${prepared.sourceFile.displayName ?? prepared.sourceFile.id} (${targetLocale}): ${
                    error instanceof Error ? error.message : "unknown error"
                  }`,
                );
              }
            }
          }
        }
      }
    } finally {
      await stopTranslationSandbox(sandboxId);
    }
  }

  const result = {
    changedItems,
    warnings,
    unitsProcessed,
    skippedExistingLocales,
    filesProcessed,
  };

  // Every source file being already fully translated is a healthy no-op, not a failed run.
  const allSourceFilesAlreadyTranslated =
    skippedFullyTranslatedCount > 0 && skippedFullyTranslatedCount === input.sourceFiles.length;

  if (input.content.units.length > 0 && filesProcessed === 0 && !allSourceFilesAlreadyTranslated) {
    logger.warn(
      {
        ...logContext,
        unitCount: input.content.units.length,
        proposedCount: changedItems.length,
        unitsProcessed,
        filesProcessed,
        skippedMissingSourcePathCount,
        skippedNoMatchingUnitsCount,
        skippedFullyTranslatedCount,
        skippedDownloadFailureCount,
        warningCount: warnings.length,
        unitFileIdCounts,
        sourceFileIds: input.sourceFiles.map((file) => ({
          id: file.id,
          hasSourcePath: Boolean(file.sourcePath?.trim()),
        })),
        reason: "no_files_processed",
      },
      "provider agent file translation completed without processing any source files",
    );
  } else {
    logger.info(
      {
        ...logContext,
        unitCount: input.content.units.length,
        proposedCount: changedItems.length,
        unitsProcessed,
        filesProcessed,
        skippedMissingSourcePathCount,
        skippedNoMatchingUnitsCount,
        skippedFullyTranslatedCount,
        skippedDownloadFailureCount,
        warningCount: warnings.length,
      },
      "provider agent file translation completed",
    );
  }

  return result;
}
