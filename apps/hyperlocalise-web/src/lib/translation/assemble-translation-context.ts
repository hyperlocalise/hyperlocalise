import { eq } from "drizzle-orm";

import type { StringTranslationJobInput } from "@/api/routes/project/job.schema";
import { db, schema } from "@/lib/database";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type { GlossaryMatchResolution } from "@/lib/providers/contracts/glossary-matcher";
import type { TranslationMemoryMatchResolution } from "@/lib/providers/contracts/translation-memory-matcher";
import {
  toContextGlossaryMatch,
  type ContextGlossaryMatch,
} from "@/lib/translation/glossary-match";
import { loadGlossaryMatchesForContext } from "@/lib/translation/load-glossary-matches";
import { getKnowledgeMemoryForOrganization } from "@/lib/knowledge-memory/knowledge-memory";
import { loadTranslationMemoryMatchesForContext } from "@/lib/translation/load-translation-memory-matches";
import {
  toContextTranslationMemoryMatch,
  type ContextTranslationMemoryMatch,
} from "@/lib/translation/translation-memory-match";

export type StringTranslationContextSnapshot = {
  assembledAt: string;
  project: {
    id: string;
    name: string;
    translationContext: string;
  };
  knowledgeMemory?: string;
  job: StringTranslationJobInput;
  glossaryTerms: ContextGlossaryMatch[];
  translationMemoryMatches: ContextTranslationMemoryMatch[];
};

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
    translationMemoryMatchResolution?: TranslationMemoryMatchResolution;
    glossaryMatchResolution?: GlossaryMatchResolution;
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

  const [knowledgeMemory, glossaryTerms, translationMemoryMatches] = await Promise.all([
    getKnowledgeMemoryForOrganization(project.organizationId).then((memory) =>
      memory.content.trim(),
    ),
    loadGlossaryMatchesForContext({
      projectId,
      organizationId: options?.organizationId,
      providerKind,
      sourceLocale: jobInput.sourceLocale,
      targetLocales: jobInput.targetLocales,
      sourceText: jobInput.sourceText,
      glossaryMatchResolution: options?.glossaryMatchResolution,
    }).then((matches) => matches.map(toContextGlossaryMatch)),
    loadTranslationMemoryMatchesForContext({
      projectId,
      organizationId: options?.organizationId,
      providerKind,
      externalJobUid: options?.externalJobUid,
      sourceLocale: jobInput.sourceLocale,
      targetLocales: jobInput.targetLocales,
      sourceText: jobInput.sourceText,
      translationMemoryMatchResolution: options?.translationMemoryMatchResolution,
    }).then((matches) => matches.map(toContextTranslationMemoryMatch)),
  ]);

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
      glossaryTerms,
      translationMemoryMatches,
      ...(knowledgeMemory ? { knowledgeMemory } : {}),
    } satisfies StringTranslationContextSnapshot,
  } as const;
}
