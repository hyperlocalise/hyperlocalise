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
