import { createHash } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database";

export function hashProjectFileStringSourceText(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

export type ProjectFileStringRepositoryContextRecord = {
  stringKey: string;
  repositoryFullName: string;
  sourceTextHash: string;
  summary: string;
  updatedAt: Date;
};

export async function getCachedProjectFileStringRepositoryContext(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  stringKey: string;
  repositoryFullName: string;
  sourceText: string;
}): Promise<string | null> {
  const [row] = await db
    .select({
      summary: schema.projectFileStringRepositoryContexts.summary,
      sourceTextHash: schema.projectFileStringRepositoryContexts.sourceTextHash,
    })
    .from(schema.projectFileStringRepositoryContexts)
    .where(
      and(
        eq(schema.projectFileStringRepositoryContexts.organizationId, input.organizationId),
        eq(schema.projectFileStringRepositoryContexts.projectId, input.projectId),
        eq(schema.projectFileStringRepositoryContexts.sourcePath, input.sourcePath),
        eq(schema.projectFileStringRepositoryContexts.stringKey, input.stringKey),
        eq(schema.projectFileStringRepositoryContexts.repositoryFullName, input.repositoryFullName),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const sourceTextHash = hashProjectFileStringSourceText(input.sourceText);
  if (row.sourceTextHash !== sourceTextHash) {
    return null;
  }

  return row.summary;
}

export async function listCachedProjectFileStringRepositoryContexts(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  stringKeys: string[];
  preferredRepositoryFullName?: string | null;
  sourceTextByKey: ReadonlyMap<string, string>;
}): Promise<Map<string, string>> {
  if (input.stringKeys.length === 0) {
    return new Map();
  }

  const sourceTextHashByKey = new Map<string, string>();
  for (const [stringKey, sourceText] of input.sourceTextByKey) {
    sourceTextHashByKey.set(stringKey, hashProjectFileStringSourceText(sourceText));
  }

  const rows = await db
    .select({
      stringKey: schema.projectFileStringRepositoryContexts.stringKey,
      repositoryFullName: schema.projectFileStringRepositoryContexts.repositoryFullName,
      sourceTextHash: schema.projectFileStringRepositoryContexts.sourceTextHash,
      summary: schema.projectFileStringRepositoryContexts.summary,
      updatedAt: schema.projectFileStringRepositoryContexts.updatedAt,
    })
    .from(schema.projectFileStringRepositoryContexts)
    .where(
      and(
        eq(schema.projectFileStringRepositoryContexts.organizationId, input.organizationId),
        eq(schema.projectFileStringRepositoryContexts.projectId, input.projectId),
        eq(schema.projectFileStringRepositoryContexts.sourcePath, input.sourcePath),
        inArray(schema.projectFileStringRepositoryContexts.stringKey, input.stringKeys),
      ),
    );

  const matchesByKey = new Map<string, ProjectFileStringRepositoryContextRecord[]>();
  for (const row of rows) {
    const sourceTextHash = sourceTextHashByKey.get(row.stringKey);
    if (!sourceTextHash) {
      continue;
    }

    if (row.sourceTextHash !== sourceTextHash) {
      continue;
    }

    const existing = matchesByKey.get(row.stringKey) ?? [];
    existing.push(row);
    matchesByKey.set(row.stringKey, existing);
  }

  const summaries = new Map<string, string>();
  for (const [stringKey, matches] of matchesByKey) {
    const preferred = input.preferredRepositoryFullName
      ? matches.find((match) => match.repositoryFullName === input.preferredRepositoryFullName)
      : undefined;
    const selected =
      preferred ??
      [...matches].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0];
    if (selected) {
      summaries.set(stringKey, selected.summary);
    }
  }

  return summaries;
}

export async function saveProjectFileStringRepositoryContext(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  stringKey: string;
  repositoryFullName: string;
  sourceText: string;
  summary: string;
  createdByUserId: string;
}): Promise<void> {
  const sourceTextHash = hashProjectFileStringSourceText(input.sourceText);
  const now = new Date();

  await db
    .insert(schema.projectFileStringRepositoryContexts)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      stringKey: input.stringKey,
      repositoryFullName: input.repositoryFullName,
      sourceTextHash,
      summary: input.summary,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        schema.projectFileStringRepositoryContexts.organizationId,
        schema.projectFileStringRepositoryContexts.projectId,
        schema.projectFileStringRepositoryContexts.sourcePath,
        schema.projectFileStringRepositoryContexts.stringKey,
        schema.projectFileStringRepositoryContexts.repositoryFullName,
      ],
      set: {
        sourceTextHash,
        summary: input.summary,
        createdByUserId: input.createdByUserId,
        updatedAt: now,
      },
    });
}
