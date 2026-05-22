import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type { StringTranslationJobInput } from "@/api/routes/project/job.schema";
import { db, schema } from "@/lib/database";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

const maxContextSearchTerms = 50;

export type StringTranslationContextSnapshot = {
  assembledAt: string;
  project: {
    id: string;
    name: string;
    translationContext: string;
  };
  job: {
    sourceLocale: string;
    targetLocales: string[];
    sourceText: string;
    context?: string;
    metadata?: Record<string, string>;
    maxLength?: number;
  };
  glossaryTerms: Array<{
    id: string;
    glossaryId: string;
    glossaryName: string;
    sourceTerm: string;
    targetTerm: string;
    targetLocale: string;
    description: string | null;
    forbidden: boolean | null;
    rank: number;
  }>;
  translationMemoryMatches: Array<{
    id: string;
    memoryId: string;
    sourceText: string;
    targetText: string;
    targetLocale: string;
    provenance: string | null;
    matchScore: number | null;
    rank: number;
  }>;
};

function buildTsQuery(input: string): string {
  return input
    .replace(/[&|!():*<>'"]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxContextSearchTerms)
    .map((word) => `${word}:*`)
    .join(" & ");
}

export type TranslationContextProject = {
  id: string;
  name: string;
  translationContext: string;
};

async function loadProjectForContext(projectId: string): Promise<TranslationContextProject | null> {
  const [project] = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      translationContext: schema.projects.translationContext,
    })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);

  return project ?? null;
}

async function loadGlossaryTermsForContext(input: {
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  sourceText: string;
}) {
  const tsQuery = buildTsQuery(input.sourceText);
  if (!tsQuery) {
    return [];
  }

  const attached = await db
    .select({ glossaryId: schema.projectGlossaries.glossaryId })
    .from(schema.projectGlossaries)
    .where(eq(schema.projectGlossaries.projectId, input.projectId));
  const glossaryIds = attached.map((item) => item.glossaryId);
  if (glossaryIds.length === 0) {
    return [];
  }

  return db
    .select({
      id: schema.glossaryTerms.id,
      glossaryId: schema.glossaryTerms.glossaryId,
      glossaryName: schema.glossaries.name,
      sourceTerm: schema.glossaryTerms.sourceTerm,
      targetTerm: schema.glossaryTerms.targetTerm,
      targetLocale: schema.glossaries.targetLocale,
      description: schema.glossaryTerms.description,
      forbidden: schema.glossaryTerms.forbidden,
      rank: sql<number>`ts_rank(${schema.glossaryTerms.searchVector}, to_tsquery('simple', ${tsQuery}))`.as(
        "rank",
      ),
    })
    .from(schema.glossaryTerms)
    .innerJoin(schema.glossaries, eq(schema.glossaryTerms.glossaryId, schema.glossaries.id))
    .where(
      and(
        inArray(schema.glossaryTerms.glossaryId, glossaryIds),
        eq(schema.glossaries.sourceLocale, input.sourceLocale),
        inArray(schema.glossaries.targetLocale, input.targetLocales),
        eq(schema.glossaries.status, "active"),
        sql`${schema.glossaryTerms.searchVector} @@ to_tsquery('simple', ${tsQuery})`,
      ),
    )
    .orderBy(desc(sql`rank`))
    .limit(20);
}

async function loadMemoryMatchesForContext(input: {
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  sourceText: string;
}) {
  const attached = await db
    .select({ memoryId: schema.projectMemories.memoryId })
    .from(schema.projectMemories)
    .where(eq(schema.projectMemories.projectId, input.projectId));
  const memoryIds = attached.map((item) => item.memoryId);
  if (memoryIds.length === 0) {
    return [];
  }

  const normalized = normalizeTranslationMemorySourceText(input.sourceText);
  const exactMatches = await db
    .select({
      id: schema.memoryEntries.id,
      memoryId: schema.memoryEntries.memoryId,
      sourceText: schema.memoryEntries.sourceText,
      targetText: schema.memoryEntries.targetText,
      targetLocale: schema.memoryEntries.targetLocale,
      provenance: schema.memoryEntries.provenance,
      matchScore: schema.memoryEntries.matchScore,
      rank: sql<number>`1`.as("rank"),
    })
    .from(schema.memoryEntries)
    .where(
      and(
        inArray(schema.memoryEntries.memoryId, memoryIds),
        eq(schema.memoryEntries.normalizedSourceText, normalized),
        eq(schema.memoryEntries.sourceLocale, input.sourceLocale),
        inArray(schema.memoryEntries.targetLocale, input.targetLocales),
        eq(schema.memoryEntries.reviewStatus, "approved"),
      ),
    )
    .limit(10);

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  const tsQuery = buildTsQuery(input.sourceText);
  if (!tsQuery) {
    return [];
  }

  return db
    .select({
      id: schema.memoryEntries.id,
      memoryId: schema.memoryEntries.memoryId,
      sourceText: schema.memoryEntries.sourceText,
      targetText: schema.memoryEntries.targetText,
      targetLocale: schema.memoryEntries.targetLocale,
      provenance: schema.memoryEntries.provenance,
      matchScore: schema.memoryEntries.matchScore,
      rank: sql<number>`ts_rank(${schema.memoryEntries.searchVector}, to_tsquery('simple', ${tsQuery}))`.as(
        "rank",
      ),
    })
    .from(schema.memoryEntries)
    .where(
      and(
        inArray(schema.memoryEntries.memoryId, memoryIds),
        eq(schema.memoryEntries.sourceLocale, input.sourceLocale),
        inArray(schema.memoryEntries.targetLocale, input.targetLocales),
        eq(schema.memoryEntries.reviewStatus, "approved"),
        sql`${schema.memoryEntries.searchVector} @@ to_tsquery('simple', ${tsQuery})`,
      ),
    )
    .orderBy(desc(sql`rank`))
    .limit(10);
}

export async function loadTranslationContextProject(projectId: string) {
  return loadProjectForContext(projectId);
}

export async function assembleStringTranslationContextSnapshot(
  projectId: string,
  jobInput: StringTranslationJobInput,
  projectOverride?: TranslationContextProject | null,
) {
  const project =
    projectOverride === undefined ? await loadProjectForContext(projectId) : projectOverride;
  if (!project) {
    return {
      ok: false,
      code: "translation_project_not_found",
      message: `translation project ${projectId} was not found`,
    } as const;
  }

  const [glossaryTerms, translationMemoryMatches] = await Promise.all([
    loadGlossaryTermsForContext({
      projectId,
      sourceLocale: jobInput.sourceLocale,
      targetLocales: jobInput.targetLocales,
      sourceText: jobInput.sourceText,
    }),
    loadMemoryMatchesForContext({
      projectId,
      sourceLocale: jobInput.sourceLocale,
      targetLocales: jobInput.targetLocales,
      sourceText: jobInput.sourceText,
    }),
  ]);

  return {
    ok: true,
    snapshot: {
      assembledAt: new Date().toISOString(),
      project,
      job: jobInput,
      glossaryTerms,
      translationMemoryMatches,
    } satisfies StringTranslationContextSnapshot,
  } as const;
}
