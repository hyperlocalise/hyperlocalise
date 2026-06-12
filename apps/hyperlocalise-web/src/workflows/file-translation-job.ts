import { getWorkflowMetadata } from "workflow";
import { and, asc, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { logTranslatedFileDiagnostics } from "@/lib/translation/diagnostics";
import {
  isImageTranslationFileFormat,
  type SupportedTranslationFileFormat,
} from "@/lib/translation/file-formats";
import {
  buildTempConfig,
  createTranslationSandbox,
  getSandboxInputFilename,
  getSandboxOutputFilename,
  getSandboxTranslationEnv,
  prepareSandbox,
  readTranslatedFile,
  runSandboxCommand,
  type SandboxTranslationContext,
  stopTranslationSandbox,
  userFacingFailureReason,
  writeFileToSandbox,
  writeTempConfig,
} from "@/lib/translation/sandbox-translation";
import {
  sourceContainsTerm,
  validateGlossaryTermsInTranslation,
} from "@/lib/glossary/validate-glossary-terms-in-translation";
import type { TranslationJobEventData } from "@/lib/workflow/types";
import {
  claimTranslationJobStep,
  completeFileTranslationJobStep,
  failTranslationJobStep,
  getProjectOrganizationStep,
  getStoredFileContentStep,
  getStoredFileStep,
  persistFileProjectTranslationsStep,
  persistFileTranslationMemoryEntriesStep,
  reuseFileTranslationMemoryEntriesStep,
  storeOutputFileStep,
} from "./steps/translation-job";

function shellSingleQuote(value: string) {
  return value.replaceAll("'", "'\\''");
}

async function createSandboxStep() {
  "use step";
  return createTranslationSandbox();
}

async function prepareSandboxStep(sandboxId: string) {
  "use step";
  return prepareSandbox(sandboxId);
}

async function writeSourceFileStep(sandboxId: string, filename: string, content: Buffer) {
  "use step";
  return writeFileToSandbox(sandboxId, filename, content);
}

async function runTranslationStep(
  sandboxId: string,
  inputFile: string,
  outputFile: string,
  sourceLocale: string | null,
  targetLocale: string,
  instructions: string | null,
  context: SandboxTranslationContext,
  prefilledEntries: Record<string, string>,
) {
  "use step";

  const configPath = "/tmp/hyperlocalise-file.yml";
  const config = buildTempConfig(
    inputFile,
    outputFile,
    sourceLocale,
    targetLocale,
    instructions,
    context,
  );
  await writeTempConfig(sandboxId, config, configPath);

  const prefilledPath = `/tmp/hyperlocalise-prefilled-${targetLocale}.json`;
  let prefilledFlags = "";
  if (Object.keys(prefilledEntries).length > 0) {
    await writeFileToSandbox(
      sandboxId,
      prefilledPath,
      Buffer.from(JSON.stringify(prefilledEntries), "utf8"),
    );
    prefilledFlags = ` --prefilled-entries '${shellSingleQuote(prefilledPath)}' --prefilled-target-path '${shellSingleQuote(outputFile)}'`;
  }

  return runSandboxCommand(
    sandboxId,
    "bash",
    [
      "-lc",
      `export PATH="$HOME/.local/bin:$PATH"; hl run --config '${shellSingleQuote(configPath)}' --locale '${shellSingleQuote(targetLocale)}' --force --progress off${prefilledFlags}`,
    ],
    {
      env: getSandboxTranslationEnv(),
    },
  );
}

async function extractEntriesStep(sandboxId: string, path: string) {
  "use step";
  const result = await runSandboxCommand(
    sandboxId,
    "bash",
    ["-lc", `export PATH="$HOME/.local/bin:$PATH"; hl entries '${shellSingleQuote(path)}'`],
    { env: getSandboxTranslationEnv(), output: "stdout" },
  );
  if (result.exitCode !== 0) {
    throw new Error(`failed to extract entries for ${path}: ${result.output}`);
  }
  return JSON.parse(result.output) as Record<string, string>;
}
async function readOutputStep(sandboxId: string, outputFile: string, _attempt: 1 | 2) {
  "use step";
  return readTranslatedFile(sandboxId, outputFile);
}

async function stopSandboxStep(sandboxId: string) {
  "use step";
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

    const outputFiles: Array<{ fileId: string; locale: string; filename: string }> = [];
    let sourceEntries: Record<string, string> | null = null;

    try {
      sourceEntries = await extractEntriesStep(sandboxId, inputFilename);
    } catch (error) {
      console.warn("[file-translation-workflow] source TM extraction failed", {
        jobId: claim.job.id,
        projectId: claim.job.projectId,
        sourcePath: sourceFile.filename,
        error: userFacingFailureReason(error),
      });
    }

    const sourceText = sourceContent.toString("utf8");

    for (const targetLocale of parsedInput.targetLocales) {
      const outputFilename = getSandboxOutputFilename(sourceFile.filename, targetLocale);
      let reusedEntries: Record<string, string> = {};
      if (sourceEntries) {
        reusedEntries = await reuseFileTranslationMemoryEntriesStep({
          projectId: claim.job.projectId,
          sourceLocale: parsedInput.sourceLocale,
          targetLocale,
          sourceEntries,
        });
        if (Object.keys(reusedEntries).length > 0) {
          console.info("[file-translation-workflow] matched reusable translation memory entries", {
            jobId: claim.job.id,
            projectId: claim.job.projectId,
            targetLocale,
            reusedEntryCount: Object.keys(reusedEntries).length,
            sourceEntryCount: Object.keys(sourceEntries).length,
          });
        }
      }
      const localeContext = context.glossaryTerms
        ? {
            ...context,
            glossaryTerms: context.glossaryTerms.filter(
              (term) => term.targetLocale === targetLocale,
            ),
          }
        : context;

      const runTranslationWithValidation = async (attempt: 1 | 2, retryFeedback?: string) => {
        const translation = await runTranslationStep(
          sandboxId,
          inputFilename,
          outputFilename,
          parsedInput.sourceLocale,
          targetLocale,
          retryFeedback ? [instructions, retryFeedback].filter(Boolean).join("\n\n") : instructions,
          localeContext,
          reusedEntries,
        );

        if (translation.exitCode !== 0) {
          throw new Error(`translation failed for ${targetLocale}: ${translation.output}`);
        }

        const translatedContent = await readOutputStep(sandboxId, outputFilename, attempt);
        const translatedText = translatedContent.toString("utf8");
        const glossaryFailures = validateGlossaryTermsInTranslation({
          sourceText,
          translatedText,
          terms: (localeContext.glossaryTerms ?? []).map((term) => ({
            sourceTerm: term.sourceTerm,
            targetTerm: term.targetTerm,
            targetLocale: term.targetLocale,
            forbidden: term.forbidden,
            caseSensitive: term.caseSensitive,
          })),
        });

        if (glossaryFailures.length > 0 && attempt === 1) {
          const feedback = [
            `Glossary validation failed for locale ${targetLocale}. Fix these term constraints exactly and regenerate:`,
            ...glossaryFailures.map((failure) =>
              failure.forbidden
                ? `- Forbidden term violation for source "${failure.sourceTerm}": do not use "${failure.targetTerm}"`
                : `- Missing preferred term for source "${failure.sourceTerm}": must include "${failure.targetTerm}"`,
            ),
          ].join("\n");
          return runTranslationWithValidation(2, feedback);
        }

        if (glossaryFailures.length > 0) {
          const diagnostics = {
            targetLocale,
            failedTermCount: glossaryFailures.length,
            failures: glossaryFailures,
          };
          throw new Error(`glossary validation failed: ${JSON.stringify(diagnostics)}`);
        }

        return translatedContent;
      };

      const translatedContent = await runTranslationWithValidation(1);
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

      if (sourceEntries) {
        try {
          const targetEntries = await extractEntriesStep(sandboxId, outputFilename);
          await persistFileTranslationMemoryEntriesStep({
            projectId: claim.job.projectId,
            jobId: claim.job.id,
            sourceLocale: parsedInput.sourceLocale,
            targetLocale,
            sourcePath: sourceFile.filename,
            sourceFileHash: sourceFile.sha256,
            sourceEntries,
            targetEntries,
          });
          await persistFileProjectTranslationsStep({
            organizationId,
            projectId: claim.job.projectId,
            jobId: claim.job.id,
            sourcePath: sourceFile.filename,
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
            sourcePath: sourceFile.filename,
            outputPath: outputFilename,
            error: userFacingFailureReason(error),
          });
        }
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
    const reason = userFacingFailureReason(error);
    console.error("[file-translation-workflow] file translation failed", {
      jobId: claim.job.id,
      projectId: claim.job.projectId,
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
