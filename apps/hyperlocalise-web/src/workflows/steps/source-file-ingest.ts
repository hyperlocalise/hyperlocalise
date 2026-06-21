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
