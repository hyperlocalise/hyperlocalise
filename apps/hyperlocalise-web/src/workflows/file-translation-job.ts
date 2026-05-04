import { getWorkflowMetadata } from "workflow";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { getFileStorageAdapter } from "@/lib/file-storage";
import { createStoredFile } from "@/lib/file-storage/records";
import { createLogger } from "@/lib/log";
import {
  createTranslationSandbox,
  getSandboxInputFilename,
  getSandboxOutputFilename,
  getSandboxTranslationEnv,
  logTranslatedFileDiagnostics,
  prepareSandbox,
  readTranslatedFile,
  runSandboxCommand,
  stopTranslationSandbox,
  userFacingFailureReason,
  writeFileToSandbox,
  writeTempConfig,
} from "@/lib/translation/sandbox-translation";
import type { TranslationJobQueuedEventData } from "@/lib/workflow/types";
import {
  claimTranslationJob,
  failTranslationJob,
} from "@/lib/translation/translation-job-queued-function";

const logger = createLogger("file-translation-workflow");

async function claimTranslationJobStep(input: {
  event: TranslationJobQueuedEventData;
  runId: string;
}) {
  "use step";
  return claimTranslationJob(input);
}

async function failTranslationJobStep(input: Parameters<typeof failTranslationJob>[0]) {
  "use step";
  return failTranslationJob(input);
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
) {
  "use step";

  const configPath = "/tmp/hyperlocalise-file.yml";
  const { buildTempConfig } = await import("@/lib/translation/sandbox-translation");
  const config = buildTempConfig(inputFile, outputFile, sourceLocale, targetLocale, instructions);
  await writeTempConfig(sandboxId, config, configPath);

  return runSandboxCommand(
    sandboxId,
    "bash",
    [
      "-lc",
      `export PATH="$HOME/.local/bin:$PATH"; hl run --config '${configPath.replaceAll("'", "'\\''")}' --locale '${targetLocale.replaceAll("'", "'\\''")}' --force --progress off`,
    ],
    {
      env: getSandboxTranslationEnv(),
    },
  );
}

async function readOutputStep(sandboxId: string, outputFile: string) {
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

async function completeFileTranslationJob(input: {
  jobId: string;
  projectId: string;
  workflowRunId: string;
  outputFiles: Array<{ fileId: string; locale: string; filename: string }>;
}) {
  "use step";

  const didSucceed = await db.transaction(async (tx) => {
    const [updatedJob] = await tx
      .update(schema.jobs)
      .set({
        status: "succeeded",
        outcomePayload: {
          outputFiles: input.outputFiles,
        },
        lastError: null,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(schema.jobs.kind, "translation"),
          eq(schema.jobs.id, input.jobId),
          eq(schema.jobs.projectId, input.projectId),
          eq(schema.jobs.workflowRunId, input.workflowRunId),
        ),
      )
      .returning({ id: schema.jobs.id });

    if (!updatedJob) {
      return false;
    }

    await tx
      .update(schema.translationJobDetails)
      .set({ outcomeKind: "file_result" })
      .where(eq(schema.translationJobDetails.jobId, input.jobId));

    return true;
  });

  if (!didSucceed) {
    throw new Error(
      `translation job ${input.jobId} is not owned by workflow run ${input.workflowRunId}`,
    );
  }

  return input.outputFiles;
}

function bufferFromStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();

    function read() {
      reader
        .read()
        .then(({ done, value }) => {
          if (done) {
            resolve(Buffer.concat(chunks.map((c) => Buffer.from(c))));
            return;
          }
          if (value) {
            chunks.push(value);
          }
          read();
        })
        .catch(reject);
    }

    read();
  });
}

export async function fileTranslationJobWorkflow(event: TranslationJobQueuedEventData) {
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

  const [project] = await db
    .select({ organizationId: schema.projects.organizationId })
    .from(schema.projects)
    .where(eq(schema.projects.id, claim.job.projectId))
    .limit(1);

  if (!project) {
    await failTranslationJobStep({
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      workflowRunId: claim.job.workflowRunId,
      code: "translation_project_not_found",
      message: `project ${claim.job.projectId} not found`,
    });
    throw new Error("project not found");
  }

  const sourceFile = await db
    .select()
    .from(schema.storedFiles)
    .where(
      and(
        eq(schema.storedFiles.id, parsedInput.sourceFileId),
        eq(schema.storedFiles.organizationId, project.organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!sourceFile) {
    await failTranslationJobStep({
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      workflowRunId: claim.job.workflowRunId,
      code: "source_file_not_found",
      message: `source file ${parsedInput.sourceFileId} not found`,
    });
    throw new Error("source file not found");
  }

  const adapter = getFileStorageAdapter();
  const storedObject = await adapter.get({ keyOrUrl: sourceFile.storageKey });

  if (!storedObject) {
    await failTranslationJobStep({
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      workflowRunId: claim.job.workflowRunId,
      code: "source_file_unavailable",
      message: `source file ${parsedInput.sourceFileId} could not be retrieved from storage`,
    });
    throw new Error("source file unavailable");
  }

  let sourceContent: Buffer;
  try {
    sourceContent = await bufferFromStream(storedObject.body);
  } catch (error) {
    await failTranslationJobStep({
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      workflowRunId: claim.job.workflowRunId,
      code: "source_file_read_failed",
      message: "failed to read source file content",
    });
    throw error;
  }

  const { sandboxId } = await createSandboxStep();
  const inputFilename = getSandboxInputFilename(sourceFile.filename);
  const instructions = parsedInput.metadata?.instructions ?? null;

  try {
    await prepareSandboxStep(sandboxId);
    await writeSourceFileStep(sandboxId, inputFilename, sourceContent);

    const outputFiles: Array<{ fileId: string; locale: string; filename: string }> = [];

    for (const targetLocale of parsedInput.targetLocales) {
      const outputFilename = getSandboxOutputFilename(sourceFile.filename, targetLocale);

      const translation = await runTranslationStep(
        sandboxId,
        inputFilename,
        outputFilename,
        parsedInput.sourceLocale,
        targetLocale,
        instructions,
      );

      if (translation.exitCode !== 0) {
        throw new Error(`translation failed for ${targetLocale}: ${translation.output}`);
      }

      const translatedContent = await readOutputStep(sandboxId, outputFilename);
      await logDiagnosticsStep(
        claim.job.id,
        sourceFile.filename,
        targetLocale,
        translatedContent,
        outputFilename,
      );

      const storedOutput = await createStoredFile({
        organizationId: project.organizationId,
        projectId: claim.job.projectId,
        role: "output",
        sourceKind: "job_output",
        sourceJobId: claim.job.id,
        filename: outputFilename,
        contentType: sourceFile.contentType,
        content: translatedContent,
      });

      outputFiles.push({
        fileId: storedOutput.id,
        locale: targetLocale,
        filename: outputFilename,
      });
    }

    await completeFileTranslationJob({
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      workflowRunId: claim.job.workflowRunId,
      outputFiles,
    });

    return outputFiles;
  } catch (error) {
    const reason = userFacingFailureReason(error);
    logger.error(
      {
        jobId: claim.job.id,
        projectId: claim.job.projectId,
        error: reason,
      },
      "file translation failed",
    );
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
