import type { ProjectSourceStringEntry } from "@/api/routes/project/project.schema";

export async function claimSourceFileIngestStep(input: {
  sourceFileVersionId: string;
  organizationId: string;
  workflowRunId: string;
}) {
  "use step";
  const { claimSourceFileIngest } = await import("@/lib/projects/files/source-file-ingest");
  return claimSourceFileIngest(input);
}

export async function getStoredFileMetadataStep(fileId: string, organizationId: string) {
  "use step";
  const { and, eq } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/database");

  const [file] = await db
    .select({
      id: schema.storedFiles.id,
      filename: schema.storedFiles.filename,
    })
    .from(schema.storedFiles)
    .where(
      and(eq(schema.storedFiles.id, fileId), eq(schema.storedFiles.organizationId, organizationId)),
    )
    .limit(1);

  if (!file) {
    throw new Error(`stored file ${fileId} not found`);
  }

  return file;
}

export async function createSourceIngestSandboxStep() {
  "use step";
  const { createTranslationSandbox } = await import("@/lib/translation/sandbox-translation");
  return createTranslationSandbox();
}

export async function prepareSourceIngestSandboxStep(sandboxId: string) {
  "use step";
  const { prepareSandbox } = await import("@/lib/translation/sandbox-translation");
  return prepareSandbox(sandboxId);
}

export async function writeSourceIngestFileStep(
  sandboxId: string,
  filename: string,
  content: Buffer,
) {
  "use step";
  const { writeFileToSandbox } = await import("@/lib/translation/sandbox-translation");
  return writeFileToSandbox(sandboxId, filename, content);
}

export async function extractSourceIngestEntriesStep(sandboxId: string, filePath: string) {
  "use step";
  const { extractSandboxEntries } = await import("@/lib/translation/sandbox-translation");
  const entries = await extractSandboxEntries(sandboxId, filePath);
  if (!entries) {
    throw new Error(`failed to extract entries for ${filePath}`);
  }
  return entries;
}

export async function parseHlEntriesStep(
  extractedEntries: Record<string, string>,
): Promise<ProjectSourceStringEntry[]> {
  "use step";
  const { entriesFromHlOutput } = await import("@/lib/projects/files/source-file-ingest");
  return entriesFromHlOutput(extractedEntries);
}

export async function stopSourceIngestSandboxStep(sandboxId: string) {
  "use step";
  const { stopTranslationSandbox } = await import("@/lib/translation/sandbox-translation");
  return stopTranslationSandbox(sandboxId);
}

export async function upsertSourceFileTranslationKeysStep(input: {
  organizationId: string;
  projectId: string;
  repositorySourceFileId: string;
  sourceFileVersionId: string;
  entries: ProjectSourceStringEntry[];
}) {
  "use step";
  const { upsertProjectTranslationKeysFromEntries } =
    await import("@/lib/projects/translations/project-translation-service");
  return upsertProjectTranslationKeysFromEntries({
    organizationId: input.organizationId,
    projectId: input.projectId,
    repositorySourceFileId: input.repositorySourceFileId,
    sourceFileVersionId: input.sourceFileVersionId,
    entries: input.entries,
  });
}

export async function markSourceFileIngestStateStep(input: {
  sourceFileVersionId: string;
  organizationId: string;
  ingestState: "ingested" | "skipped" | "failed";
  ingestError?: string | null;
  ingestWorkflowRunId?: string | null;
  ingestedAt?: Date | null;
  fromIngestingWorkflowRunId?: string;
}) {
  "use step";
  const { markSourceFileIngestState } = await import("@/lib/projects/files/source-file-ingest");
  return markSourceFileIngestState(input);
}

export async function dispatchSourceUploadAutomationsStep(input: {
  organizationId: string;
  projectId: string;
  sourceFileId: string;
  sourceFileVersionId: string;
  sourcePath: string;
}) {
  "use step";
  const { dispatchSourceUploadAutomations } =
    await import("@/lib/projects/files/source-file-ingest");
  return dispatchSourceUploadAutomations(input);
}
