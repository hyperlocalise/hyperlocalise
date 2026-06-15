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
} from "@/lib/providers/download-provider-source-file";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";
import type {
  ExternalTmsTaskContent,
  ExternalTmsTranslationUnit,
} from "@/lib/providers/tms-provider-types";
import {
  sourceContainsTerm,
  validateGlossaryTermsInTranslation,
} from "@/lib/glossary/validate-glossary-terms-in-translation";
import { reuseFileTranslationMemoryEntries } from "@/lib/translation/file-translation-memory";
import type { SandboxTranslationContext } from "@/lib/translation/sandbox-translation";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import { createLogger } from "@/lib/log";
import { loadTranslationContextProject } from "@/lib/translation/assemble-translation-context";

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
  targetLocale: string;
}): SandboxTranslationContext {
  const attachedTerms = (input.glossaryTerms ?? []).filter((term) =>
    sourceContainsTerm(input.sourceText, {
      sourceTerm: term.sourceTerm,
      caseSensitive: term.caseSensitive ?? false,
    }),
  );

  return {
    projectName: input.projectName,
    projectTranslationContext: input.projectTranslationContext,
    glossaryTerms: attachedTerms
      .filter((term) => term.targetLocale === input.targetLocale)
      .slice(0, 50),
  };
}

async function runFileTranslationInSandbox(input: {
  sandboxId: string;
  sourceFilename: string;
  sourceLocale: string;
  targetLocale: string;
  context: SandboxTranslationContext;
  prefilledEntries: Record<string, string>;
}) {
  const {
    buildTempConfig,
    extractSandboxEntries,
    getSandboxOutputFilename,
    getSandboxTranslationEnv,
    readTranslatedFile,
    runSandboxCommand,
    writeFileToSandbox,
    writeTempConfig,
  } = await import("@/lib/translation/sandbox-translation");

  const inputFilename = sanitizeSandboxFilename(input.sourceFilename);
  const outputFilename = getSandboxOutputFilename(input.sourceFilename, input.targetLocale);

  const configPath = "/tmp/hyperlocalise-file.yml";
  const config = buildTempConfig(
    inputFilename,
    outputFilename,
    input.sourceLocale,
    input.targetLocale,
    null,
    input.context,
  );
  await writeTempConfig(input.sandboxId, config, configPath);

  const prefilledPath = `/tmp/hyperlocalise-prefilled-${input.targetLocale}.json`;
  let prefilledFlags = "";
  if (Object.keys(input.prefilledEntries).length > 0) {
    await writeFileToSandbox(
      input.sandboxId,
      prefilledPath,
      Buffer.from(JSON.stringify(input.prefilledEntries), "utf8"),
    );
    prefilledFlags = ` --prefilled-entries '${shellSingleQuote(prefilledPath)}' --prefilled-target-path '${shellSingleQuote(outputFilename)}'`;
  }

  const translation = await runSandboxCommand(
    input.sandboxId,
    "bash",
    [
      "-lc",
      `export PATH="$HOME/.local/bin:$PATH"; hl run --config '${shellSingleQuote(configPath)}' --locale '${shellSingleQuote(input.targetLocale)}' --force --progress off${prefilledFlags}`,
    ],
    { env: getSandboxTranslationEnv() },
  );

  if (translation.exitCode !== 0) {
    throw new Error(`translation failed for ${input.targetLocale}: ${translation.output}`);
  }

  const translatedContent = await readTranslatedFile(input.sandboxId, outputFilename);
  const translatedEntries = await extractSandboxEntries(input.sandboxId, outputFilename);
  if (!translatedEntries) {
    throw new Error(`failed to extract translated entries: ${outputFilename}`);
  }

  return {
    translatedText: translatedContent.toString("utf8"),
    translatedEntries,
  };
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

    const crowdinContext =
      input.providerKind === "crowdin"
        ? await loadProviderCrowdinDownloadContext({
            organizationId: input.organizationId,
            projectId: input.projectId,
            providerKind: input.providerKind,
            actorUserId: input.actorUserId,
          })
        : null;
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

    const {
      createTranslationSandbox,
      downloadAttachment,
      downloadCrowdinSourceInSandbox,
      downloadCrowdinTranslationsInSandbox,
      extractSandboxEntries,
      getSandboxOutputFilename,
      prepareSandbox,
      readTranslatedFile,
      stopTranslationSandbox,
    } = await import("@/lib/translation/sandbox-translation");
    const { sandboxId } = await createTranslationSandbox();

    let sourceText = "";
    let sourceEntries: Record<string, string> | null = null;

    try {
      await prepareSandbox(sandboxId);

      if (crowdinContext?.ok) {
        await downloadCrowdinSourceInSandbox({
          sandboxId,
          externalFileId: sourceFile.id,
          sourceFilename: inputFilename,
          externalProjectId: crowdinContext.externalProjectId,
          secretMaterial: crowdinContext.secretMaterial,
          baseUrl: crowdinContext.baseUrl,
        });
      } else if (resolvedDownload?.ok) {
        await downloadAttachment(sandboxId, resolvedDownload.downloadUrl, inputFilename);
      }

      const sourceContent = await readTranslatedFile(sandboxId, inputFilename);
      sourceText = sourceContent.toString("utf8");

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
          downloadMethod: crowdinContext?.ok ? "hl-crowdin-download-sources" : "curl",
        },
        "provider agent file translation downloaded source file in sandbox",
      );

      try {
        sourceEntries = await extractSandboxEntries(sandboxId, inputFilename);
      } catch (error) {
        warnings.push(
          `Could not extract entries for ${sourceFile.displayName ?? sourceFile.id}: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }

      const fileGlossaryTerms = await loadFileGlossaryTerms({
        projectId: input.projectId,
        sourceLocale,
        targetLocales,
        sourceText,
      });

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

        if (localesNeedingTranslation.length === 0) {
          logger.info(
            {
              ...logContext,
              sourceFileId: sourceFile.id,
              targetLocale,
              matchingUnitCount: fileUnits.length,
              reason: "all_units_already_translated",
            },
            "provider agent file translation skipped locale because all units already have translations",
          );
          continue;
        }

        const existingPrefilled = buildPrefilledEntriesForLocale({
          units: fileUnits,
          targetLocale,
        });
        let tmPrefilled: Record<string, string> = {};
        if (sourceEntries) {
          tmPrefilled = await reuseFileTranslationMemoryEntries({
            projectId: input.projectId,
            sourceLocale,
            targetLocale,
            sourceEntries,
          });
        }

        let crowdinPrefilled: Record<string, string> = {};
        if (crowdinContext?.ok) {
          const outputFilename = getSandboxOutputFilename(inputFilename, targetLocale);
          const downloadResult = await downloadCrowdinTranslationsInSandbox({
            sandboxId,
            targetLocale,
            externalProjectId: crowdinContext.externalProjectId,
            secretMaterial: crowdinContext.secretMaterial,
            baseUrl: crowdinContext.baseUrl,
            mergeApproved: true,
          });
          if (downloadResult.ok) {
            crowdinPrefilled = (await extractSandboxEntries(sandboxId, outputFilename)) ?? {};
          }
        }

        const prefilledEntries = { ...tmPrefilled, ...crowdinPrefilled, ...existingPrefilled };

        const localeContext = buildGlossaryContext({
          sourceText,
          projectName: project.name,
          projectTranslationContext: project.translationContext,
          glossaryTerms: fileGlossaryTerms,
          targetLocale,
        });

        try {
          const { translatedText, translatedEntries } = await runFileTranslationInSandbox({
            sandboxId,
            sourceFilename: inputFilename,
            sourceLocale,
            targetLocale,
            context: localeContext,
            prefilledEntries,
          });

          const glossaryFailures = validateGlossaryTermsInTranslation({
            sourceText,
            translatedText,
            terms: (localeContext.glossaryTerms ?? []).map((term) => ({
              sourceTerm: term.sourceTerm,
              targetTerm: term.targetTerm,
              targetLocale: term.targetLocale,
              forbidden: term.forbidden ?? null,
              caseSensitive: term.caseSensitive ?? null,
            })),
          });
          if (glossaryFailures.length > 0) {
            warnings.push(
              `Glossary validation failed for ${sourceFile.displayName ?? sourceFile.id} (${targetLocale})`,
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
              glossaryTerms: (localeContext.glossaryTerms ?? []).map((term) => ({
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
            `File translation failed for ${sourceFile.displayName ?? sourceFile.id} (${targetLocale}): ${
              error instanceof Error ? error.message : "unknown error"
            }`,
          );
        }
      }
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

  if (input.content.units.length > 0 && filesProcessed === 0) {
    logger.warn(
      {
        ...logContext,
        unitCount: input.content.units.length,
        proposedCount: changedItems.length,
        unitsProcessed,
        filesProcessed,
        skippedMissingSourcePathCount,
        skippedNoMatchingUnitsCount,
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
        skippedDownloadFailureCount,
        warningCount: warnings.length,
      },
      "provider agent file translation completed",
    );
  }

  return result;
}
