import {
  detectAgentRunProposalWarnings,
  deriveChangedFields,
  buildAgentRunProposalItemId,
  serializeAgentRunProposalItem,
  type AgentRunProposalItem,
} from "@/lib/providers/agent-runs/agent-run-proposals";
import { downloadProviderSourceFile } from "@/lib/providers/download-provider-source-file";
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
import { loadTranslationContextProject } from "@/lib/translation/assemble-translation-context";

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

function getSandboxOutputFilename(attachmentFilename: string, targetLocale: string): string {
  const inputFilename = sanitizeSandboxFilename(attachmentFilename);
  const lastDot = inputFilename.lastIndexOf(".");
  if (lastDot === -1) {
    return `${inputFilename}-${targetLocale}`;
  }

  const name = inputFilename.slice(0, lastDot);
  const ext = inputFilename.slice(lastDot);
  return `${name}-${targetLocale}${ext}`;
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
  sourceContent: Buffer;
  sourceFilename: string;
  sourceLocale: string;
  targetLocale: string;
  context: SandboxTranslationContext;
  prefilledEntries: Record<string, string>;
}) {
  const {
    buildTempConfig,
    createTranslationSandbox,
    getSandboxTranslationEnv,
    prepareSandbox,
    readTranslatedFile,
    runSandboxCommand,
    stopTranslationSandbox,
    writeFileToSandbox,
    writeTempConfig,
  } = await import("@/lib/translation/sandbox-translation");

  const inputFilename = sanitizeSandboxFilename(input.sourceFilename);
  const outputFilename = getSandboxOutputFilename(input.sourceFilename, input.targetLocale);
  const { sandboxId } = await createTranslationSandbox();

  try {
    await prepareSandbox(sandboxId);
    await writeFileToSandbox(sandboxId, inputFilename, input.sourceContent);

    const configPath = "/tmp/hyperlocalise-file.yml";
    const config = buildTempConfig(
      inputFilename,
      outputFilename,
      input.sourceLocale,
      input.targetLocale,
      null,
      input.context,
    );
    await writeTempConfig(sandboxId, config, configPath);

    const prefilledPath = `/tmp/hyperlocalise-prefilled-${input.targetLocale}.json`;
    let prefilledFlags = "";
    if (Object.keys(input.prefilledEntries).length > 0) {
      await writeFileToSandbox(
        sandboxId,
        prefilledPath,
        Buffer.from(JSON.stringify(input.prefilledEntries), "utf8"),
      );
      prefilledFlags = ` --prefilled-entries '${shellSingleQuote(prefilledPath)}' --prefilled-target-path '${shellSingleQuote(outputFilename)}'`;
    }

    const translation = await runSandboxCommand(
      sandboxId,
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

    const translatedContent = await readTranslatedFile(sandboxId, outputFilename);
    const extractResult = await runSandboxCommand(
      sandboxId,
      "bash",
      [
        "-lc",
        `export PATH="$HOME/.local/bin:$PATH"; hl entries '${shellSingleQuote(outputFilename)}'`,
      ],
      { env: getSandboxTranslationEnv(), output: "stdout" },
    );
    if (extractResult.exitCode !== 0) {
      throw new Error(`failed to extract translated entries: ${extractResult.output}`);
    }

    return {
      translatedText: translatedContent.toString("utf8"),
      translatedEntries: JSON.parse(extractResult.output) as Record<string, string>,
    };
  } finally {
    await stopTranslationSandbox(sandboxId);
  }
}

export function shouldUseProviderFileTranslation(input: { sourceFiles: ProviderSourceFileRef[] }) {
  return input.sourceFiles.some((file) => Boolean(file.sourcePath?.trim()));
}

export async function translateProviderJobFiles(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  content: ExternalTmsTaskContent;
  sourceFiles: ProviderSourceFileRef[];
  actorUserId?: string | null;
  targetLocales?: string[];
}): Promise<ProviderAgentFileTranslationResult> {
  const project = await loadTranslationContextProject(input.projectId);
  if (!project) {
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

  for (const sourceFile of input.sourceFiles) {
    if (!sourceFile.sourcePath?.trim()) {
      continue;
    }

    const fileUnits = unitsForFile(input.content.units, sourceFile.id);
    if (fileUnits.length === 0) {
      continue;
    }

    const download = await downloadProviderSourceFile({
      organizationId: input.organizationId,
      projectId: input.projectId,
      providerKind: input.providerKind,
      externalFileId: sourceFile.id,
      sourcePath: sourceFile.sourcePath,
      actorUserId: input.actorUserId,
    });

    if (!download.ok) {
      warnings.push(`Skipped file ${sourceFile.displayName ?? sourceFile.id}: ${download.message}`);
      continue;
    }

    filesProcessed += 1;
    const sourceText = download.content.toString("utf8");
    const fileGlossaryTerms = await loadFileGlossaryTerms({
      projectId: input.projectId,
      sourceLocale,
      targetLocales,
      sourceText,
    });

    let sourceEntries: Record<string, string> | null = null;
    try {
      const {
        createTranslationSandbox,
        prepareSandbox,
        runSandboxCommand,
        stopTranslationSandbox,
        writeFileToSandbox,
        getSandboxTranslationEnv,
      } = await import("@/lib/translation/sandbox-translation");
      const inputFilename = sanitizeSandboxFilename(download.filename);
      const { sandboxId } = await createTranslationSandbox();
      try {
        await prepareSandbox(sandboxId);
        await writeFileToSandbox(sandboxId, inputFilename, download.content);
        const extractResult = await runSandboxCommand(
          sandboxId,
          "bash",
          [
            "-lc",
            `export PATH="$HOME/.local/bin:$PATH"; hl entries '${shellSingleQuote(inputFilename)}'`,
          ],
          { env: getSandboxTranslationEnv(), output: "stdout" },
        );
        if (extractResult.exitCode === 0) {
          sourceEntries = JSON.parse(extractResult.output) as Record<string, string>;
        }
      } finally {
        await stopTranslationSandbox(sandboxId);
      }
    } catch (error) {
      warnings.push(
        `Could not extract entries for ${sourceFile.displayName ?? sourceFile.id}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }

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
      const prefilledEntries = { ...tmPrefilled, ...existingPrefilled };

      const localeContext = buildGlossaryContext({
        sourceText,
        projectName: project.name,
        projectTranslationContext: project.translationContext,
        glossaryTerms: fileGlossaryTerms,
        targetLocale,
      });

      try {
        const { translatedText, translatedEntries } = await runFileTranslationInSandbox({
          sourceContent: download.content,
          sourceFilename: download.filename,
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
  }

  return {
    changedItems,
    warnings,
    unitsProcessed,
    skippedExistingLocales,
    filesProcessed,
  };
}
