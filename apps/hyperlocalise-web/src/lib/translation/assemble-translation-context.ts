import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type { StringTranslationJobInput } from "@/api/routes/project/job.schema";
import { db, schema } from "@/lib/database";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import { loadPhraseTranslationContextMatches } from "@/lib/providers/phrase/load-phrase-translation-context-matches";
import { mergeTranslationContextMatches } from "@/lib/providers/phrase/normalize-phrase-context-matches";
import { loadTranslationMemoryMatchesForContext } from "@/lib/translation/load-translation-memory-matches";
import {
  toContextTranslationMemoryMatch,
  type ContextTranslationMemoryMatch,
} from "@/lib/translation/translation-memory-match";

const maxContextSearchTerms = 50;

export type StringTranslationContextSnapshot = {
  assembledAt: string;
  project: {
    id: string;
    name: string;
    translationContext: string;
  };
  job: StringTranslationJobInput;
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
  translationMemoryMatches: ContextTranslationMemoryMatch[];
};

function buildTsQuery(input: string): string {
  return input
    .replace(/[&|!():*<>'"-]/g, " ")
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

export type TranslationContextProjectRecord = TranslationContextProject &
  Pick<
    typeof schema.projects.$inferSelect,
    | "organizationId"
    | "source"
    | "externalProviderKind"
    | "externalProjectId"
    | "externalProviderCredentialId"
    | "providerMetadata"
  >;

async function loadProjectForContext(
  projectId: string,
): Promise<TranslationContextProjectRecord | null> {
  const [project] = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      translationContext: schema.projects.translationContext,
      organizationId: schema.projects.organizationId,
      source: schema.projects.source,
      externalProviderKind: schema.projects.externalProviderKind,
      externalProjectId: schema.projects.externalProjectId,
      externalProviderCredentialId: schema.projects.externalProviderCredentialId,
      providerMetadata: schema.projects.providerMetadata,
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

export async function loadTranslationContextProject(projectId: string) {
  return loadProjectForContext(projectId);
}

export async function assembleStringTranslationContextSnapshot(
  projectId: string,
  jobInput: StringTranslationJobInput,
  projectOverride?: TranslationContextProjectRecord | null,
  options?: {
    organizationId?: string;
    providerKind?: ExternalTmsProviderKind;
    externalJobUid?: string | null;
  },
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

  const providerKind = options?.providerKind ?? project.externalProviderKind ?? undefined;

  const [glossaryTerms, translationMemoryMatches, phraseLiveGlossaryTerms] = await Promise.all([
    loadGlossaryTermsForContext({
      projectId,
      sourceLocale: jobInput.sourceLocale,
      targetLocales: jobInput.targetLocales,
      sourceText: jobInput.sourceText,
    }),
    loadTranslationMemoryMatchesForContext({
      projectId,
      organizationId: options?.organizationId,
      providerKind,
      externalJobUid: options?.externalJobUid,
      sourceLocale: jobInput.sourceLocale,
      targetLocales: jobInput.targetLocales,
      sourceText: jobInput.sourceText,
    }).then((matches) => matches.map(toContextTranslationMemoryMatch)),
    providerKind === "phrase"
      ? loadPhraseTranslationContextMatches({
          project,
          externalJobUid: options?.externalJobUid,
          sourceLocale: jobInput.sourceLocale,
          targetLocales: jobInput.targetLocales,
          sourceText: jobInput.sourceText,
        }).then((result) => result.glossaryTerms)
      : Promise.resolve([]),
  ]);

  const mergedGlossaryTerms = mergeTranslationContextMatches(
    glossaryTerms,
    phraseLiveGlossaryTerms,
    20,
  );

  return {
    ok: true,
    snapshot: {
      assembledAt: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        translationContext: project.translationContext,
      },
      job: jobInput,
      glossaryTerms: mergedGlossaryTerms,
      translationMemoryMatches,
    } satisfies StringTranslationContextSnapshot,
  } as const;
}
