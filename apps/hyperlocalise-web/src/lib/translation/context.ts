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
import { eq } from "drizzle-orm";

import type { StringTranslationJobInput } from "@/api/routes/project/job.schema";
import { db, schema } from "@/lib/database/client";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type { GlossaryMatchResolution } from "@/lib/providers/contracts/glossary-matcher";
import type { TranslationMemoryMatchResolution } from "@/lib/providers/contracts/translation-memory-matcher";
import { composeScopedKnowledgeMemory } from "@/lib/knowledge-memory/knowledge-memory-compose";
import {
  getKnowledgeMemoryForOrganization,
  getKnowledgeMemoryForProject,
} from "@/lib/knowledge-memory/knowledge-memory";
import { selectKnowledgeMemoryContext } from "@/lib/knowledge-memory/knowledge-memory-selection";
import type { KnowledgeMemoryRecord } from "@/lib/knowledge-memory/knowledge-memory.types";
import { loadUploadedGuidelinesContext } from "@/lib/knowledge-memory/uploaded-guidelines-context";
import {
  NO_GUIDELINES_USED,
  glossaryUses,
  translationMemoryUses,
  type GlossaryUse,
  type GuidelinesUsed,
  type TranslationMemoryUse,
  type TypedGuidelineUse,
} from "@/lib/translation/generation-provenance";
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

export type TranslationGuidelines = {
  /** Guideline text for the prompt; empty when no guideline applies. */
  text: string;
  used: GuidelinesUsed;
};

const NO_TRANSLATION_GUIDELINES: TranslationGuidelines = { text: "", used: NO_GUIDELINES_USED };

function typedGuidelineUse(
  memory: KnowledgeMemoryRecord,
  selectedText: string,
): TypedGuidelineUse | undefined {
  if (!memory.revisionId || !selectedText.trim()) return undefined;
  return { revisionId: memory.revisionId, version: memory.version };
}

/**
 * Selects the project, workspace and uploaded guidelines for a translation and records which of
 * them reached the prompt.
 */
export async function loadTranslationGuidelines(input: {
  project: Pick<
    TranslationContextProjectRecord,
    "id" | "name" | "organizationId" | "translationContext"
  >;
  sourceLocale: string;
  targetLocales: string[];
  sourceText: string;
  context?: string | null;
  metadata?: Record<string, string>;
}): Promise<TranslationGuidelines> {
  const [projectMemory, organizationMemory, uploadedGuidelines] = await Promise.all([
    getKnowledgeMemoryForProject(input.project.id),
    getKnowledgeMemoryForOrganization(input.project.organizationId),
    loadUploadedGuidelinesContext({
      organizationId: input.project.organizationId,
      projectId: input.project.id,
      targetLocales: input.targetLocales,
      sourceText: input.sourceText,
    }),
  ]);
  const selectionInput = {
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    sourceText: input.sourceText,
    context: input.context ?? undefined,
    metadata: input.metadata,
    projectName: input.project.name,
    projectTranslationContext: input.project.translationContext,
  };
  const projectGuideline = selectKnowledgeMemoryContext({
    ...selectionInput,
    content: projectMemory.content,
  }).compactText;
  const workspaceGuideline = selectKnowledgeMemoryContext({
    ...selectionInput,
    content: organizationMemory.content,
  }).compactText;
  const project = typedGuidelineUse(projectMemory, projectGuideline);
  const workspace = typedGuidelineUse(organizationMemory, workspaceGuideline);

  return {
    text: composeScopedKnowledgeMemory({
      projectGuideline,
      workspaceGuideline,
      uploadedGuidelines: uploadedGuidelines.text,
    }),
    used: {
      ...(project ? { project } : {}),
      ...(workspace ? { workspace } : {}),
      documents: uploadedGuidelines.documents,
    },
  };
}

/** What a built context contributed to the prompt, for generation provenance. */
export type TranslationContextUse = {
  guidelines: GuidelinesUsed;
  glossaries: GlossaryUse[];
  translationMemories: TranslationMemoryUse[];
};

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
      actorUserId?: string | null;
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

    const guidelinesPromise =
      options?.knowledgeMemoryEnabled === true
        ? loadTranslationGuidelines({
            project,
            sourceLocale: jobInput.sourceLocale,
            targetLocales: jobInput.targetLocales,
            sourceText: jobInput.sourceText,
            context: jobInput.context,
            metadata: jobInput.metadata,
          })
        : Promise.resolve(NO_TRANSLATION_GUIDELINES);

    if (options?.skipConcordance) {
      const guidelines = await guidelinesPromise;

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
          guidelines.text || null,
          [],
          [],
        ),
        use: {
          guidelines: guidelines.used,
          glossaries: [],
          translationMemories: [],
        } satisfies TranslationContextUse,
      };
    }

    const [guidelines, glossaryTerms, translationMemoryMatches] = await Promise.all([
      guidelinesPromise,
      this.glossaryService
        .searchForContext({
          projectId,
          organizationId: options?.organizationId,
          providerKind,
          actorUserId: options?.actorUserId,
          sourceLocale: jobInput.sourceLocale,
          targetLocales: jobInput.targetLocales,
          sourceText: jobInput.sourceText,
          glossaryMatchResolution: options?.glossaryMatchResolution,
        })
        .then((matches) =>
          matches.flatMap((match) => {
            const contextMatch = toContextGlossaryMatch(match);
            return contextMatch ? [contextMatch] : [];
          }),
        ),
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
        guidelines.text || null,
        glossaryTerms,
        translationMemoryMatches,
      ),
      use: {
        guidelines: guidelines.used,
        glossaries: glossaryUses(glossaryTerms),
        translationMemories: translationMemoryUses(translationMemoryMatches),
      } satisfies TranslationContextUse,
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
