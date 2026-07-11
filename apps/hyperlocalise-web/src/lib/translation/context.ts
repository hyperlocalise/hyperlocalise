import { eq } from "drizzle-orm";

import type { StringTranslationJobInput } from "@/api/routes/project/job.schema";
import { db, schema } from "@/lib/database";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type { GlossaryMatchResolution } from "@/lib/providers/contracts/glossary-matcher";
import type { TranslationMemoryMatchResolution } from "@/lib/providers/contracts/translation-memory-matcher";
import { getKnowledgeMemoryForOrganization } from "@/lib/knowledge-memory/knowledge-memory";
import { selectKnowledgeMemoryContext } from "@/lib/knowledge-memory/knowledge-memory-selection";
import {
  TranslationContext,
  toContextGlossaryMatch,
  toContextTranslationMemoryMatch,
  type TranslationContextProjectRecord,
} from "@/lib/translation/domain";
import {
  GlossaryConcordanceService,
  TranslationMemoryConcordanceService,
} from "@/lib/translation/concordance";

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

export class TranslationContextBuilder {
  private readonly glossaryService = new GlossaryConcordanceService();
  private readonly memoryService = new TranslationMemoryConcordanceService();

  async loadProject(projectId: string): Promise<TranslationContextProjectRecord | null> {
    return loadProjectForContext(projectId);
  }

  async build(
    projectId: string,
    jobInput: StringTranslationJobInput,
    projectOverride?: TranslationContextProjectRecord | null,
    options?: {
      organizationId?: string;
      providerKind?: ExternalTmsProviderKind;
      externalJobUid?: string | null;
      translationMemoryMatchResolution?: TranslationMemoryMatchResolution;
      glossaryMatchResolution?: GlossaryMatchResolution;
      skipConcordance?: boolean;
      knowledgeMemoryEnabled?: boolean;
    },
  ) {
    const project =
      projectOverride === undefined ? await loadProjectForContext(projectId) : projectOverride;
    if (!project) {
      return {
        ok: false as const,
        code: "translation_project_not_found",
        message: `translation project ${projectId} was not found`,
      };
    }

    const providerKind = options?.providerKind ?? project.externalProviderKind ?? undefined;

    const knowledgeMemoryPromise = options?.knowledgeMemoryEnabled
      ? getKnowledgeMemoryForOrganization(project.organizationId).then((memory) =>
          selectKnowledgeMemoryContext({
            content: memory.content,
            sourceLocale: jobInput.sourceLocale,
            targetLocales: jobInput.targetLocales,
            sourceText: jobInput.sourceText,
            context: jobInput.context,
            metadata: jobInput.metadata,
            projectName: project.name,
            projectTranslationContext: project.translationContext,
          }).compactText.trim(),
        )
      : Promise.resolve("");

    if (options?.skipConcordance) {
      const knowledgeMemory = await knowledgeMemoryPromise;

      return {
        ok: true as const,
        context: new TranslationContext(
          new Date().toISOString(),
          {
            id: project.id,
            name: project.name,
            translationContext: project.translationContext,
          },
          jobInput,
          knowledgeMemory || null,
          [],
          [],
        ),
      };
    }

    const [knowledgeMemory, glossaryTerms, translationMemoryMatches] = await Promise.all([
      knowledgeMemoryPromise,
      this.glossaryService
        .searchForContext({
          projectId,
          organizationId: options?.organizationId,
          providerKind,
          sourceLocale: jobInput.sourceLocale,
          targetLocales: jobInput.targetLocales,
          sourceText: jobInput.sourceText,
          glossaryMatchResolution: options?.glossaryMatchResolution,
        })
        .then((matches) => matches.map(toContextGlossaryMatch)),
      this.memoryService
        .searchForContext({
          projectId,
          organizationId: options?.organizationId,
          providerKind,
          externalJobUid: options?.externalJobUid,
          sourceLocale: jobInput.sourceLocale,
          targetLocales: jobInput.targetLocales,
          sourceText: jobInput.sourceText,
          translationMemoryMatchResolution: options?.translationMemoryMatchResolution,
        })
        .then((matches) => matches.map(toContextTranslationMemoryMatch)),
    ]);

    return {
      ok: true as const,
      context: new TranslationContext(
        new Date().toISOString(),
        {
          id: project.id,
          name: project.name,
          translationContext: project.translationContext,
        },
        jobInput,
        knowledgeMemory || null,
        glossaryTerms,
        translationMemoryMatches,
      ),
    };
  }
}

const defaultBuilder = new TranslationContextBuilder();

export async function loadTranslationContextProject(projectId: string) {
  return defaultBuilder.loadProject(projectId);
}

export async function assembleStringTranslationContextSnapshot(
  projectId: string,
  jobInput: StringTranslationJobInput,
  projectOverride?: TranslationContextProjectRecord | null,
  options?: Parameters<TranslationContextBuilder["build"]>[3],
) {
  const result = await defaultBuilder.build(projectId, jobInput, projectOverride, options);
  if (!result.ok) {
    return result;
  }

  return {
    ok: true as const,
    snapshot: result.context.toSnapshot(),
  };
}

export type { TranslationContextProjectRecord };
