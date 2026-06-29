export async function extractTranslationImportEntriesStep(input: {
  sandboxId: string;
  filePath: string;
  targetLocale: string;
}) {
  "use step";
  const { extractSandboxEntries } = await import("@/lib/translation/sandbox-translation");
  const entries = await extractSandboxEntries(input.sandboxId, input.filePath, {
    locale: input.targetLocale,
  });
  if (!entries) {
    throw new Error(`failed to extract entries for ${input.filePath}`);
  }
  return entries;
}

export async function importTranslationsFromEntriesStep(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  entries: Record<string, string>;
  actorUserId?: string | null;
}) {
  "use step";
  const { importApprovedProjectTranslationsFromEntries } =
    await import("@/lib/projects/translations/project-translation-service");
  return importApprovedProjectTranslationsFromEntries({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocale: input.targetLocale,
    entries: input.entries,
    actorUserId: input.actorUserId ?? null,
  });
}
