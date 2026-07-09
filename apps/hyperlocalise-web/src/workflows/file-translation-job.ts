import { getWorkflowMetadata } from "workflow";

import {
  sourceContainsTerm,
  validateGlossaryTermsInTranslation,
} from "@/lib/glossary/validate-glossary-terms-in-translation";
import {
  inferSupportedFileTranslationFileFormat,
  isImageTranslationFileFormat,
  isSupportedFileTranslationFileFormat,
  type SupportedTranslationFileFormat,
} from "@/lib/translation/file-formats";
import type { SandboxTranslationContext } from "@/lib/translation/domain";
import type { TranslationJobEventData } from "@/lib/workflow/types";
import {
  claimTranslationJobStep,
  completeFileTranslationJobStep,
  failTranslationJobStep,
  getProjectOrganizationStep,
  getStoredFileContentStep,
  getStoredFileStep,
  getRepositorySourcePathForStoredFileStep,
  loadProjectTranslationsAsPrefilledEntriesStep,
  persistFileProjectTranslationsStep,
  persistFileTranslationMemoryEntriesStep,
  reuseFileTranslationMemoryEntriesStep,
  storeOutputFileStep,
} from "./steps/translation-job";

function shellSingleQuote(value: string) {
  return value.replaceAll("'", "'\\''");
}

function sanitizeSandboxFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getSandboxInputFilename(attachmentFilename: string): string {
  return sanitizeSandboxFilename(attachmentFilename);
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

function getSandboxOutputFilenamePattern(attachmentFilename: string): string {
  const inputFilename = sanitizeSandboxFilename(attachmentFilename);
  const lastDot = inputFilename.lastIndexOf(".");
  if (lastDot === -1) {
    return `${inputFilename}-{{target}}`;
  }

  const name = inputFilename.slice(0, lastDot);
  const ext = inputFilename.slice(lastDot);
  return `${name}-{{target}}${ext}`;
}

function fileExtension(filename: string): string | null {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return null;
  }
  return filename.slice(lastDot).toLowerCase();
}

/** Classify CLI failures using only known safe substrings — never log raw CLI output. */
function classifyCliFailureKind(output: string): string {
  if (output.includes("markdown AST parity mismatch")) {
    return "markdown_ast_parity_mismatch";
  }
  if (output.includes("markdown parity retry exhausted")) {
    return "markdown_parity_retry_exhausted";
  }
  if (output.includes("placeholder parity")) {
    return "placeholder_parity_mismatch";
  }
  if (output.includes("escapes root")) {
    return "path_escapes_root";
  }
  if (output.includes("OPENAI_API_KEY")) {
    return "missing_openai_api_key";
  }
  if (output.includes("planning tasks")) {
    return "planning_failed";
  }
  if (output.includes("no extension")) {
    return "missing_file_extension";
  }
  if (output.includes("translation file parser")) {
    return "parser_failed";
  }
  return "unknown";
}

function formatDetectionLabel(input: {
  fileFormat?: string | null;
  sourceExtension?: string | null;
  sandboxInputExtension?: string | null;
}): string | null {
  const fileFormat = input.fileFormat?.trim();
  if (fileFormat) {
    return fileFormat;
  }
  const extension = input.sandboxInputExtension?.trim() || input.sourceExtension?.trim();
  if (extension) {
    return extension.startsWith(".") ? extension.slice(1) : extension;
  }
  return null;
}

function cliFailureKindFromMessage(message: string): string | null {
  const match = /kind=([a-z0-9_]+)/i.exec(message);
  return match?.[1] ?? null;
}

function resolveSupportedFormat(detection?: {
  fileFormat?: string | null;
  sourceExtension?: string | null;
  sandboxInputExtension?: string | null;
}): SupportedTranslationFileFormat | null {
  const fileFormat = detection?.fileFormat?.trim();
  if (
    fileFormat &&
    isSupportedFileTranslationFileFormat(fileFormat as SupportedTranslationFileFormat)
  ) {
    return fileFormat as SupportedTranslationFileFormat;
  }

  const extension = detection?.sandboxInputExtension?.trim() || detection?.sourceExtension?.trim();
  if (!extension) {
    return null;
  }
  return inferSupportedFileTranslationFileFormat(
    `file${extension.startsWith(".") ? extension : `.${extension}`}`,
  );
}

function userFacingTranslationFailureReason(
  message: string,
  detection?: {
    fileFormat?: string | null;
    sourceExtension?: string | null;
    sandboxInputExtension?: string | null;
  },
): string {
  const kind = cliFailureKindFromMessage(message);
  const supportedFormat = resolveSupportedFormat(detection);
  const detected = detection ? formatDetectionLabel(detection) : null;
  const label = detected || supportedFormat;

  if (kind === "markdown_ast_parity_mismatch" || kind === "markdown_parity_retry_exhausted") {
    return "markdown translation finished but the output structure no longer matched the source. Try again, or simplify complex markdown in the source file.";
  }
  if (kind === "placeholder_parity_mismatch") {
    return "the translation changed placeholders or markup that must stay identical to the source.";
  }
  if (kind === "missing_openai_api_key") {
    return "something went wrong while setting up the translation environment on our end.";
  }
  if (kind === "parser_failed" || kind === "missing_file_extension") {
    if (label && !supportedFormat) {
      return `the detected file format (${label}) is not supported for file translation.`;
    }
    return label
      ? `the ${label} file couldn't be parsed for translation.`
      : "the file couldn't be parsed for translation.";
  }

  if (supportedFormat && label) {
    return `translating the ${label} file failed. This is usually temporary — try again.`;
  }
  if (label) {
    return `the detected file format (${label}) may not be supported, or the content didn't match what the translator expected.`;
  }
  return "the file format may not be supported, or the content didn't match what the translator expected.";
}

function userFacingFailureReason(
  error: unknown,
  detection?: {
    fileFormat?: string | null;
    sourceExtension?: string | null;
    sandboxInputExtension?: string | null;
  },
): string {
  const message = error instanceof Error ? error.message : "Unknown translation failure";

  if (message.startsWith("glossary validation failed")) {
    return message;
  }

  if (
    message.includes("hyperlocalise CLI installation failed") ||
    message.includes("sandbox tool installation failed")
  ) {
    return "something went wrong while setting up the translation environment on our end.";
  }

  if (message.includes("failed to download attachment")) {
    return "the attachment couldn't be retrieved. It may have been too large or the link expired.";
  }

  if (message.includes("translation failed") || message.includes("failed to extract entries")) {
    return userFacingTranslationFailureReason(message, detection);
  }

  if (message.includes("failed to read translated file")) {
    return "the translation finished, but the output file couldn't be read back. This is usually temporary.";
  }

  return "the translation failed before it could finish. This is usually temporary.";
}

async function createSandboxStep() {
  "use step";
  const { createTranslationSandbox } = await import("@/lib/translation/sandbox");
  return createTranslationSandbox();
}

async function prepareSandboxStep(sandboxId: string) {
  "use step";
  const { prepareSandbox } = await import("@/lib/translation/sandbox");
  return prepareSandbox(sandboxId);
}

async function writeSourceFileStep(sandboxId: string, filename: string, content: Buffer) {
  "use step";
  const { writeFileToSandbox } = await import("@/lib/translation/sandbox");
  return writeFileToSandbox(sandboxId, filename, content);
}

async function runTranslationStep(
  sandboxId: string,
  inputFile: string,
  outputPattern: string,
  sourceLocale: string | null,
  targetLocales: string[],
  instructions: string | null,
  context: SandboxTranslationContext,
  prefilledByLocale: Record<string, Record<string, string>>,
) {
  "use step";

  const {
    buildMultiLocaleTempConfig,
    getSandboxTranslationEnv,
    runSandboxCommand,
    sandboxI18nConfigPath,
    writeFileToSandbox,
    writeTempConfig,
  } = await import("@/lib/translation/sandbox");

  const config = buildMultiLocaleTempConfig(
    inputFile,
    outputPattern,
    sourceLocale,
    targetLocales,
    instructions,
    context,
  );
  await writeTempConfig(sandboxId, config, sandboxI18nConfigPath);

  const localeFlags =
    targetLocales.length > 0
      ? targetLocales.map((locale) => `--locale '${shellSingleQuote(locale)}'`).join(" ")
      : "";

  let prefilledFlags = "";
  const localesWithPrefill = Object.entries(prefilledByLocale).filter(
    ([, entries]) => Object.keys(entries).length > 0,
  );
  if (localesWithPrefill.length > 0) {
    const nested: Record<string, Record<string, string>> = {};
    for (const [locale, entries] of localesWithPrefill) {
      nested[locale] = entries;
    }
    const prefilledPath = "/tmp/prefilled-by-locale.json";
    await writeFileToSandbox(sandboxId, prefilledPath, Buffer.from(JSON.stringify(nested), "utf8"));
    prefilledFlags = ` --prefilled-entries '${shellSingleQuote(prefilledPath)}'`;
  }

  const localeArg = localeFlags ? ` ${localeFlags}` : "";
  return runSandboxCommand(
    sandboxId,
    "bash",
    [
      "-lc",
      `hl run --config '${shellSingleQuote(sandboxI18nConfigPath)}'${localeArg} --force --progress off${prefilledFlags}`,
    ],
    {
      env: getSandboxTranslationEnv(),
    },
  );
}

async function extractEntriesStep(sandboxId: string, path: string) {
  "use step";
  const { getSandboxTranslationEnv, runSandboxCommand } = await import("@/lib/translation/sandbox");
  const result = await runSandboxCommand(
    sandboxId,
    "bash",
    ["-lc", `hl entries '${shellSingleQuote(path)}'`],
    { env: getSandboxTranslationEnv(), output: "stdout" },
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `failed to extract entries: exitCode=${result.exitCode} kind=${classifyCliFailureKind(result.output)}`,
    );
  }
  return JSON.parse(result.output) as Record<string, string>;
}
async function readOutputStep(sandboxId: string, outputFile: string, _attempt: 1 | 2) {
  "use step";
  const { readTranslatedFile } = await import("@/lib/translation/sandbox");
  return readTranslatedFile(sandboxId, outputFile);
}

async function stopSandboxStep(sandboxId: string) {
  "use step";
  const { stopTranslationSandbox } = await import("@/lib/translation/sandbox");
  return stopTranslationSandbox(sandboxId);
}

async function logDiagnosticsStep(
  jobId: string,
  sourceFilename: string,
  targetLocale: string,
  content: Buffer,
  outputFilename: string,
) {
  "use step";

  const { logTranslatedFileDiagnostics } = await import("@/lib/translation/diagnostics");
  return logTranslatedFileDiagnostics(
    jobId,
    "file-translation",
    sourceFilename,
    targetLocale,
    content,
    outputFilename,
  );
}

async function assembleFileTranslationContextStep(input: {
  jobId: string;
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  sourceContent: Buffer;
  metadata?: Record<string, string>;
}) {
  "use step";

  const { and, asc, eq, inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/database");

  const [project] = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      translationContext: schema.projects.translationContext,
    })
    .from(schema.projects)
    .where(eq(schema.projects.id, input.projectId))
    .limit(1);

  if (!project) {
    throw new Error(`project ${input.projectId} not found`);
  }

  const sourceText = input.sourceContent.toString("utf8").slice(0, 500_000);
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

  const glossaryTerms = attachedTerms
    .filter((term) => sourceContainsTerm(sourceText, term))
    .slice(0, 50)
    .map(({ sourceTerm, targetTerm, targetLocale, description, forbidden, caseSensitive }) => ({
      sourceTerm,
      targetTerm,
      targetLocale,
      description,
      forbidden,
      caseSensitive,
    }));

  const context = {
    projectName: project.name,
    projectTranslationContext: project.translationContext,
    jobContext: input.metadata?.context ?? null,
    glossaryTerms,
  } satisfies SandboxTranslationContext;

  await db
    .update(schema.jobs)
    .set({
      contextSnapshot: {
        assembledAt: new Date().toISOString(),
        project,
        job: {
          sourceLocale: input.sourceLocale,
          targetLocales: input.targetLocales,
          metadata: input.metadata,
        },
        glossaryTerms,
      },
    })
    .where(and(eq(schema.jobs.id, input.jobId), eq(schema.jobs.projectId, input.projectId)));

  return context;
}

export async function fileTranslationJobWorkflow(event: TranslationJobEventData) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const claim = await claimTranslationJobStep({ event, runId: workflowRunId });

  if (claim.kind === "skipped") {
    return claim.job;
  }

  if (claim.job.type !== "file") {
    throw new Error(`fileTranslationJobWorkflow received non-file job: ${claim.job.type}`);
  }

  const parsedInput =
    event.type === "file"
      ? (claim.job.inputPayload as {
          sourceFileId: string;
          fileFormat: string;
          sourceLocale: string;
          targetLocales: string[];
          metadata?: Record<string, string>;
        })
      : null;

  if (!parsedInput) {
    await failTranslationJobStep({
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      workflowRunId: claim.job.workflowRunId,
      code: "invalid_file_job_input",
      message: "missing or invalid file translation job input",
    });
    throw new Error("invalid file job input");
  }

  if (isImageTranslationFileFormat(parsedInput.fileFormat as SupportedTranslationFileFormat)) {
    await failTranslationJobStep({
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      workflowRunId: claim.job.workflowRunId,
      code: "unsupported_file_format",
      message: `binary image format '${parsedInput.fileFormat}' is not supported for file translation`,
    });
    throw new Error(`unsupported image format: ${parsedInput.fileFormat}`);
  }

  let organizationId: string;
  try {
    organizationId = await getProjectOrganizationStep(claim.job.projectId);
  } catch {
    await failTranslationJobStep({
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      workflowRunId: claim.job.workflowRunId,
      code: "translation_project_not_found",
      message: `project ${claim.job.projectId} not found`,
    });
    throw new Error("project not found");
  }

  let sourceFile: Awaited<ReturnType<typeof getStoredFileStep>>;
  try {
    sourceFile = await getStoredFileStep(parsedInput.sourceFileId, organizationId);
  } catch {
    await failTranslationJobStep({
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      workflowRunId: claim.job.workflowRunId,
      code: "source_file_not_found",
      message: `source file ${parsedInput.sourceFileId} not found`,
    });
    throw new Error("source file not found");
  }

  const repositorySourcePath = await getRepositorySourcePathForStoredFileStep(
    parsedInput.sourceFileId,
    organizationId,
  );

  let sourceContent: Buffer;
  try {
    sourceContent = await getStoredFileContentStep(parsedInput.sourceFileId, organizationId);
  } catch (error) {
    await failTranslationJobStep({
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      workflowRunId: claim.job.workflowRunId,
      code: "source_file_unavailable",
      message: `source file ${parsedInput.sourceFileId} could not be retrieved from storage`,
    });
    throw error;
  }

  const { sandboxId } = await createSandboxStep();
  const inputFilename = getSandboxInputFilename(sourceFile.filename);
  const instructions = parsedInput.metadata?.instructions ?? null;
  const context = await assembleFileTranslationContextStep({
    jobId: claim.job.id,
    projectId: claim.job.projectId,
    sourceLocale: parsedInput.sourceLocale,
    targetLocales: parsedInput.targetLocales,
    sourceContent,
    metadata: parsedInput.metadata,
  });

  try {
    await prepareSandboxStep(sandboxId);
    await writeSourceFileStep(sandboxId, inputFilename, sourceContent);

    console.info("[file-translation-workflow] source file written to sandbox", {
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      storedFileId: parsedInput.sourceFileId,
      fileFormat: parsedInput.fileFormat,
      sourceExtension: fileExtension(sourceFile.filename),
      sandboxInputExtension: fileExtension(inputFilename),
      byteLength: sourceContent.byteLength,
      hasRepositorySourcePath: Boolean(repositorySourcePath),
      targetLocaleCount: parsedInput.targetLocales.length,
      sandboxId,
    });

    const outputFiles: Array<{ fileId: string; locale: string; filename: string }> = [];
    let sourceEntries: Record<string, string> | null = null;

    try {
      sourceEntries = await extractEntriesStep(sandboxId, inputFilename);
      console.info("[file-translation-workflow] source entries extracted", {
        jobId: claim.job.id,
        projectId: claim.job.projectId,
        storedFileId: parsedInput.sourceFileId,
        fileFormat: parsedInput.fileFormat,
        sourceEntryCount: Object.keys(sourceEntries).length,
      });
    } catch (error) {
      console.warn("[file-translation-workflow] source TM extraction failed", {
        jobId: claim.job.id,
        projectId: claim.job.projectId,
        storedFileId: parsedInput.sourceFileId,
        fileFormat: parsedInput.fileFormat,
        hasRepositorySourcePath: Boolean(repositorySourcePath),
        userFacingError: userFacingFailureReason(error, {
          fileFormat: parsedInput.fileFormat,
          sourceExtension: fileExtension(sourceFile.filename),
          sandboxInputExtension: fileExtension(inputFilename),
        }),
      });
    }

    const sourceText = sourceContent.toString("utf8");
    const outputPattern = getSandboxOutputFilenamePattern(sourceFile.filename);
    const prefilledByLocale: Record<string, Record<string, string>> = {};

    for (const targetLocale of parsedInput.targetLocales) {
      let tmPrefilled: Record<string, string> = {};
      if (sourceEntries) {
        tmPrefilled = await reuseFileTranslationMemoryEntriesStep({
          projectId: claim.job.projectId,
          sourceLocale: parsedInput.sourceLocale,
          targetLocale,
          sourceEntries,
        });
        if (Object.keys(tmPrefilled).length > 0) {
          console.info("[file-translation-workflow] matched reusable translation memory entries", {
            jobId: claim.job.id,
            projectId: claim.job.projectId,
            targetLocale,
            reusedEntryCount: Object.keys(tmPrefilled).length,
            sourceEntryCount: Object.keys(sourceEntries).length,
          });
        }
      }

      let existingPrefilled: Record<string, string> = {};
      if (repositorySourcePath) {
        const projectPrefill = await loadProjectTranslationsAsPrefilledEntriesStep({
          organizationId,
          projectId: claim.job.projectId,
          sourcePath: repositorySourcePath,
          targetLocale,
        });
        existingPrefilled = projectPrefill.prefilled;
        if (projectPrefill.truncated) {
          console.warn("[file-translation-workflow] project translation prefill truncated", {
            jobId: claim.job.id,
            projectId: claim.job.projectId,
            targetLocale,
            loadedKeyCount: projectPrefill.loadedKeyCount,
            maxKeyCount: projectPrefill.maxKeyCount,
          });
        }
        if (Object.keys(existingPrefilled).length > 0) {
          console.info("[file-translation-workflow] loaded existing project translations", {
            jobId: claim.job.id,
            projectId: claim.job.projectId,
            targetLocale,
            prefilledEntryCount: Object.keys(existingPrefilled).length,
          });
        }
      }

      const merged = { ...tmPrefilled, ...existingPrefilled };
      if (Object.keys(merged).length > 0) {
        prefilledByLocale[targetLocale] = merged;
      }
    }

    const prefilledLocaleCount = Object.keys(prefilledByLocale).length;
    const prefilledEntryCount = Object.values(prefilledByLocale).reduce(
      (sum, entries) => sum + Object.keys(entries).length,
      0,
    );

    console.info("[file-translation-workflow] starting hl run", {
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      storedFileId: parsedInput.sourceFileId,
      fileFormat: parsedInput.fileFormat,
      targetLocales: parsedInput.targetLocales,
      sandboxInputExtension: fileExtension(inputFilename),
      sourceEntryCount: sourceEntries ? Object.keys(sourceEntries).length : null,
      prefilledLocaleCount,
      prefilledEntryCount,
      glossaryTermCount: context.glossaryTerms?.length ?? 0,
      sandboxId,
    });

    const runHlForLocales = async (locales: string[], attempt: 1 | 2, retryFeedback?: string) => {
      const translation = await runTranslationStep(
        sandboxId,
        inputFilename,
        outputPattern,
        parsedInput.sourceLocale,
        locales,
        retryFeedback ? [instructions, retryFeedback].filter(Boolean).join("\n\n") : instructions,
        context,
        Object.fromEntries(
          locales
            .filter((locale) => prefilledByLocale[locale])
            .map((locale) => [locale, prefilledByLocale[locale]]),
        ),
      );

      if (translation.exitCode !== 0) {
        const cliFailureKind = classifyCliFailureKind(translation.output);
        console.error("[file-translation-workflow] hl run failed", {
          jobId: claim.job.id,
          projectId: claim.job.projectId,
          storedFileId: parsedInput.sourceFileId,
          fileFormat: parsedInput.fileFormat,
          targetLocales: locales,
          attempt,
          sandboxInputExtension: fileExtension(inputFilename),
          exitCode: translation.exitCode,
          cliOutputLength: translation.output.length,
          cliFailureKind,
          prefilledEntryCount,
          hasRetryFeedback: Boolean(retryFeedback),
          sandboxId,
        });
        throw new Error(
          `translation failed for ${locales.join(",")}: exitCode=${translation.exitCode} kind=${cliFailureKind}`,
        );
      }

      console.info("[file-translation-workflow] hl run succeeded", {
        jobId: claim.job.id,
        projectId: claim.job.projectId,
        fileFormat: parsedInput.fileFormat,
        targetLocales: locales,
        attempt,
        exitCode: translation.exitCode,
      });
    };

    await runHlForLocales(parsedInput.targetLocales, 1);

    type LocaleGlossaryFailure = {
      targetLocale: string;
      failures: ReturnType<typeof validateGlossaryTermsInTranslation>;
    };

    const translatedByLocale = new Map<string, Buffer>();
    const glossaryFailuresByLocale: LocaleGlossaryFailure[] = [];

    for (const targetLocale of parsedInput.targetLocales) {
      const outputFilename = getSandboxOutputFilename(sourceFile.filename, targetLocale);
      const translatedContent = await readOutputStep(sandboxId, outputFilename, 1);
      translatedByLocale.set(targetLocale, translatedContent);

      const localeTerms = (context.glossaryTerms ?? []).filter(
        (term) => term.targetLocale === targetLocale,
      );
      const glossaryFailures = validateGlossaryTermsInTranslation({
        sourceText,
        translatedText: translatedContent.toString("utf8"),
        terms: localeTerms.map((term) => ({
          sourceTerm: term.sourceTerm,
          targetTerm: term.targetTerm,
          targetLocale: term.targetLocale,
          forbidden: term.forbidden,
          caseSensitive: term.caseSensitive,
        })),
      });
      if (glossaryFailures.length > 0) {
        glossaryFailuresByLocale.push({ targetLocale, failures: glossaryFailures });
      }
    }

    if (glossaryFailuresByLocale.length > 0) {
      const failedLocales = glossaryFailuresByLocale.map((item) => item.targetLocale);
      console.warn("[file-translation-workflow] glossary validation failed; retrying", {
        jobId: claim.job.id,
        projectId: claim.job.projectId,
        failedLocales,
        failedTermCount: glossaryFailuresByLocale.reduce(
          (sum, item) => sum + item.failures.length,
          0,
        ),
        attempt: 1,
      });

      const feedback = [
        "Glossary validation failed. Fix these term constraints exactly and regenerate:",
        ...glossaryFailuresByLocale.flatMap(({ targetLocale, failures }) => [
          `Locale ${targetLocale}:`,
          ...failures.map((failure) =>
            failure.forbidden
              ? `- Forbidden term violation for source "${failure.sourceTerm}": do not use "${failure.targetTerm}"`
              : `- Missing preferred term for source "${failure.sourceTerm}": must include "${failure.targetTerm}"`,
          ),
        ]),
      ].join("\n");

      await runHlForLocales(failedLocales, 2, feedback);

      const stillFailing: LocaleGlossaryFailure[] = [];
      for (const targetLocale of failedLocales) {
        const outputFilename = getSandboxOutputFilename(sourceFile.filename, targetLocale);
        const translatedContent = await readOutputStep(sandboxId, outputFilename, 2);
        translatedByLocale.set(targetLocale, translatedContent);

        const localeTerms = (context.glossaryTerms ?? []).filter(
          (term) => term.targetLocale === targetLocale,
        );
        const glossaryFailures = validateGlossaryTermsInTranslation({
          sourceText,
          translatedText: translatedContent.toString("utf8"),
          terms: localeTerms.map((term) => ({
            sourceTerm: term.sourceTerm,
            targetTerm: term.targetTerm,
            targetLocale: term.targetLocale,
            forbidden: term.forbidden,
            caseSensitive: term.caseSensitive,
          })),
        });
        if (glossaryFailures.length > 0) {
          stillFailing.push({ targetLocale, failures: glossaryFailures });
        }
      }

      if (stillFailing.length > 0) {
        const diagnostics = stillFailing.map(({ targetLocale, failures }) => ({
          targetLocale,
          failedTermCount: failures.length,
          failures,
        }));
        throw new Error(`glossary validation failed: ${JSON.stringify(diagnostics)}`);
      }
    }

    for (const targetLocale of parsedInput.targetLocales) {
      const outputFilename = getSandboxOutputFilename(sourceFile.filename, targetLocale);
      const translatedContent = translatedByLocale.get(targetLocale);
      if (!translatedContent) {
        throw new Error(`missing translated content for ${targetLocale}`);
      }

      await logDiagnosticsStep(
        claim.job.id,
        sourceFile.filename,
        targetLocale,
        translatedContent,
        outputFilename,
      );

      const storedOutput = await storeOutputFileStep({
        organizationId,
        projectId: claim.job.projectId,
        jobId: claim.job.id,
        filename: outputFilename,
        contentType: sourceFile.contentType,
        content: translatedContent,
      });

      if (sourceEntries && repositorySourcePath) {
        try {
          const targetEntries = await extractEntriesStep(sandboxId, outputFilename);
          await persistFileTranslationMemoryEntriesStep({
            projectId: claim.job.projectId,
            jobId: claim.job.id,
            sourceLocale: parsedInput.sourceLocale,
            targetLocale,
            sourcePath: repositorySourcePath,
            sourceFileHash: sourceFile.sha256,
            sourceEntries,
            targetEntries,
          });
          await persistFileProjectTranslationsStep({
            organizationId,
            projectId: claim.job.projectId,
            jobId: claim.job.id,
            sourcePath: repositorySourcePath,
            sourceLocale: parsedInput.sourceLocale,
            targetLocale,
            sourceEntries,
            targetEntries,
          });
        } catch (error) {
          console.warn("[file-translation-workflow] target TM persistence failed", {
            jobId: claim.job.id,
            projectId: claim.job.projectId,
            targetLocale,
            userFacingError: userFacingFailureReason(error, {
              fileFormat: parsedInput.fileFormat,
              sourceExtension: fileExtension(sourceFile.filename),
              sandboxInputExtension: fileExtension(inputFilename),
            }),
          });
        }
      } else if (sourceEntries && !repositorySourcePath) {
        console.warn("[file-translation-workflow] skipped native translation persistence", {
          jobId: claim.job.id,
          projectId: claim.job.projectId,
          storedFileId: parsedInput.sourceFileId,
        });
      }

      outputFiles.push({
        fileId: storedOutput.id,
        locale: targetLocale,
        filename: outputFilename,
      });
    }

    await completeFileTranslationJobStep({
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      workflowRunId: claim.job.workflowRunId,
      outputFiles,
    });

    return outputFiles;
  } catch (error) {
    const reason = userFacingFailureReason(error, {
      fileFormat: parsedInput.fileFormat,
      sourceExtension: fileExtension(sourceFile.filename),
      sandboxInputExtension: fileExtension(inputFilename),
    });
    console.error("[file-translation-workflow] file translation failed", {
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      storedFileId: parsedInput.sourceFileId,
      fileFormat: parsedInput.fileFormat,
      sourceExtension: fileExtension(sourceFile.filename),
      sandboxInputExtension: fileExtension(inputFilename),
      byteLength: sourceContent.byteLength,
      hasRepositorySourcePath: Boolean(repositorySourcePath),
      targetLocales: parsedInput.targetLocales,
      sandboxId,
      error: reason,
    });
    await failTranslationJobStep({
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      workflowRunId: claim.job.workflowRunId,
      code: "file_translation_failed",
      message: reason,
    });
    throw error;
  } finally {
    await stopSandboxStep(sandboxId);
  }
}
