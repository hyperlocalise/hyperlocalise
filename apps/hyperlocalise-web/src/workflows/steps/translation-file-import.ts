/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
export async function extractTranslationImportEntriesStep(input: {
  sandboxId: string;
  filePath: string;
  targetLocale: string;
}) {
  "use step";
  const { extractSandboxEntries } = await import("@/lib/translation/sandbox");
  const result = await extractSandboxEntries(input.sandboxId, input.filePath, {
    locale: input.targetLocale,
  });
  if (!result.ok) {
    throw new Error(`failed to extract entries for ${input.filePath}: exitCode=${result.exitCode}`);
  }
  return result.entries;
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
