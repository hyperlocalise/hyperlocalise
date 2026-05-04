import { fetch as workflowFetch, getWorkflowMetadata } from "workflow";
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
  stopTranslationSandbox,
  userFacingFailureReason,
  writeFileToSandbox,
  writeTempConfig,
} from "@/lib/translation/sandbox-translation";
import type { TranslationJobQueuedEventData } from "@/lib/workflow/types";
import {
  getInternalApiUrl,
  internalApiHeaders,
  type ClaimTranslationJobResult,
} from "./internal-api";

async function claimTranslationJobStep(input: {
  event: TranslationJobQueuedEventData;
  runId: string;
}) {
  "use step";

  const response = await workflowFetch(getInternalApiUrl("/translation-jobs/claim"), {
    method: "POST",
    headers: internalApiHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`failed to claim translation job: ${response.status}`);
  }

  const data = (await response.json()) as { result: ClaimTranslationJobResult };
  return data.result;
}

async function failTranslationJobStep(input: {
  jobId: string;
  projectId: string;
  workflowRunId: string;
  code: string;
  message: string;
}) {
  "use step";

  const response = await workflowFetch(getInternalApiUrl("/translation-jobs/fail"), {
    method: "POST",
    headers: internalApiHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`failed to fail translation job: ${response.status}`);
  }
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

async function storeOutputFileStep(input: {
  organizationId: string;
  projectId: string;
  jobId: string;
  filename: string;
  contentType: string;
  content: Buffer;
}) {
  "use step";
  const response = await workflowFetch(getInternalApiUrl("/stored-files"), {
    method: "POST",
    headers: internalApiHeaders(),
    body: JSON.stringify({
      organizationId: input.organizationId,
      projectId: input.projectId,
      jobId: input.jobId,
      filename: input.filename,
      contentType: input.contentType,
      contentBase64: input.content.toString("base64"),
    }),
  });

  if (!response.ok) {
    throw new Error(`failed to store output file: ${response.status}`);
  }

  const data = (await response.json()) as {
    file: {
      id: string;
      filename: string;
    };
  };
  return data.file;
}

async function getProjectOrganizationStep(projectId: string): Promise<string> {
  "use step";

  const response = await workflowFetch(getInternalApiUrl(`/projects/${projectId}/organization`), {
    method: "GET",
    headers: internalApiHeaders(),
  });

  if (!response.ok) {
    throw new Error(`failed to get project organization: ${response.status}`);
  }

  const data = (await response.json()) as { organizationId: string };
  return data.organizationId;
}

async function getStoredFileStep(fileId: string, organizationId: string) {
  "use step";

  const response = await workflowFetch(
    getInternalApiUrl(
      `/stored-files/${fileId}?organizationId=${encodeURIComponent(organizationId)}`,
    ),
    {
      method: "GET",
      headers: internalApiHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(`failed to get stored file: ${response.status}`);
  }

  const data = (await response.json()) as {
    file: {
      id: string;
      filename: string;
      contentType: string;
      storageKey: string;
      organizationId: string;
    };
  };
  return data.file;
}

async function getStoredFileContentStep(fileId: string, organizationId: string) {
  "use step";

  const response = await workflowFetch(
    getInternalApiUrl(
      `/stored-files/${fileId}/content?organizationId=${encodeURIComponent(organizationId)}`,
    ),
    {
      method: "GET",
      headers: internalApiHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(`failed to get stored file content: ${response.status}`);
  }

  const data = (await response.json()) as {
    contentBase64: string;
  };
  return Buffer.from(data.contentBase64, "base64");
}

async function completeFileTranslationJobStep(input: {
  jobId: string;
  projectId: string;
  workflowRunId: string;
  outputFiles: Array<{ fileId: string; locale: string; filename: string }>;
}) {
  "use step";

  const response = await workflowFetch(getInternalApiUrl("/file-translation-jobs/complete"), {
    method: "POST",
    headers: internalApiHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`failed to complete file translation job: ${response.status}`);
  }
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

      const storedOutput = await storeOutputFileStep({
        organizationId,
        projectId: claim.job.projectId,
        jobId: claim.job.id,
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
