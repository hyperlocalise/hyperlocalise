import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { createLogger } from "@/lib/log";
import { sourceContainsTerm } from "@/lib/glossary/validate-glossary-terms-in-translation";
import {
  decryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type { GlossaryMatchResolution } from "@/lib/providers/contracts/glossary-matcher";
import type { TranslationMemoryMatchResolution } from "@/lib/providers/contracts/translation-memory-matcher";
import {
  mergeGlossaryMatches,
  normalizeSyncedDatabaseGlossaryMatch,
  toAgentRunGlossaryMatchUsage,
  type AgentRunGlossaryMatchUsage,
  type NormalizedGlossaryMatch,
} from "@/lib/providers/contracts/glossary-match";
import {
  mergeTranslationMemoryMatches,
  normalizeSyncedDatabaseTranslationMemoryMatch,
  toAgentRunTranslationMemoryMatchUsage,
  type AgentRunTranslationMemoryMatchUsage,
  type NormalizedTranslationMemoryMatch,
} from "@/lib/providers/contracts/translation-memory-match";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

const glossaryLogger = createLogger("glossary-matches");
const memoryLogger = createLogger("translation-memory-matches");

const maxContextSearchTerms = 50;

function buildGlossaryTsQuery(input: string): string | null {
  const tsQuery = input
    .replace(/[&|!():*<>'"-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxContextSearchTerms)
    .map((word) => `${word}:*`)
    .join(" & ");

  return tsQuery.length > 0 ? tsQuery : null;
}

function buildTranslationMemoryTsQuery(input: string): string {
  return input
    .replace(/[&|!():*<>'"-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxContextSearchTerms)
    .map((word) => `${word}:*`)
    .join(" & ");
}

type ConcordanceQuery = {
  projectId: string;
  organizationId?: string;
  providerKind?: ExternalTmsProviderKind;
  sourceLocale: string;
  targetLocales: string[];
  sourceText: string;
  limit?: number;
};

abstract class ConcordancePipeline<TAttached, TMatch> {
  protected abstract loadAttached(projectId: string): Promise<TAttached[]>;
  protected abstract loadSynced(query: ConcordanceQuery, attached: TAttached[]): Promise<TMatch[]>;
  protected abstract coverageKey(attached: TAttached, targetLocale: string): string | null;
  protected abstract matchCoverageKey(match: TMatch): string;
  protected abstract filterLiveSearchable(
    attached: TAttached[],
    query: ConcordanceQuery,
    syncedCoveredKeys: Set<string>,
    resolution: unknown,
  ): TAttached[];
  protected abstract searchLive(
    input: ConcordanceQuery & {
      attached: TAttached[];
      syncedCoveredKeys: Set<string>;
      organizationId: string;
      providerKind: ExternalTmsProviderKind;
      resolution: unknown;
    },
  ): Promise<TMatch[]>;
  protected abstract merge(matches: TMatch[], limit: number): TMatch[];
  protected abstract getResolution(input: ConcordanceQuery): unknown;

  async search(input: ConcordanceQuery): Promise<TMatch[]> {
    const limit = input.limit ?? this.defaultLimit();
    const attached = await this.loadAttached(input.projectId);
    if (attached.length === 0) {
      return [];
    }

    const syncedMatches = await this.loadSynced(input, attached);
    const syncedCoveredKeys = new Set(syncedMatches.map((match) => this.matchCoverageKey(match)));

    const resolution = this.getResolution(input);
    const organizationId = await this.resolveOrganizationId(input);
    const providerKind = input.providerKind ?? (await this.resolveProviderKind(input));

    const liveSearchAttached = this.filterLiveSearchable(
      attached,
      input,
      syncedCoveredKeys,
      resolution,
    );

    if (
      liveSearchAttached.length === 0 ||
      !organizationId ||
      !providerKind ||
      resolution === undefined
    ) {
      return this.merge(syncedMatches, limit);
    }

    let liveMatches: TMatch[] = [];
    try {
      liveMatches = await this.searchLive({
        ...input,
        attached: liveSearchAttached,
        syncedCoveredKeys,
        organizationId,
        providerKind,
        resolution,
      });
    } catch (error) {
      this.logLiveSearchFailure(error, input, organizationId, providerKind);
      return this.merge(syncedMatches, limit);
    }

    return this.merge([...syncedMatches, ...liveMatches], limit);
  }

  protected defaultLimit(): number {
    return 20;
  }

  protected logLiveSearchFailure(
    error: unknown,
    input: ConcordanceQuery,
    organizationId: string,
    providerKind: ExternalTmsProviderKind,
  ): void {
    glossaryLogger.error(
      { err: error, projectId: input.projectId, organizationId, providerKind },
      "Live concordance search failed; returning synced matches only",
    );
  }

  private async resolveOrganizationId(query: ConcordanceQuery): Promise<string | undefined> {
    if (query.organizationId) {
      return query.organizationId;
    }

    const [project] = await db
      .select({ organizationId: schema.projects.organizationId })
      .from(schema.projects)
      .where(eq(schema.projects.id, query.projectId))
      .limit(1);

    return project?.organizationId;
  }

  private async resolveProviderKind(
    query: ConcordanceQuery,
  ): Promise<ExternalTmsProviderKind | undefined> {
    if (query.providerKind) {
      return query.providerKind;
    }

    const [project] = await db
      .select({ externalProviderKind: schema.projects.externalProviderKind })
      .from(schema.projects)
      .where(eq(schema.projects.id, query.projectId))
      .limit(1);

    return project?.externalProviderKind ?? undefined;
  }
}

type AttachedGlossaryRecord = {
  id: string;
  name: string;
  source: (typeof schema.projectSourceEnum.enumValues)[number];
  externalProviderKind: ExternalTmsProviderKind | null;
  externalGlossaryId: string | null;
  externalProviderCredentialId: string | null;
  externalProjectId: string | null;
  targetLocale: string;
  termCapabilities: Record<string, unknown>;
};

function supportsLiveGlossarySearch(glossary: AttachedGlossaryRecord): boolean {
  if (glossary.source !== "external_tms" || !glossary.externalProviderKind) {
    return false;
  }

  if (
    glossary.termCapabilities.referenceOnly === true ||
    glossary.termCapabilities.search === false
  ) {
    return false;
  }

  return true;
}

async function loadExternalTmsProject(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
}) {
  const [project] = await db
    .select({
      id: schema.projects.id,
      organizationId: schema.projects.organizationId,
      externalProjectId: schema.projects.externalProjectId,
      externalProviderCredentialId: schema.projects.externalProviderCredentialId,
      externalProviderKind: schema.projects.externalProviderKind,
      providerMetadata: schema.projects.providerMetadata,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.externalProviderKind, input.providerKind),
        eq(schema.projects.source, "external_tms"),
      ),
    )
    .limit(1);

  return project ?? null;
}

async function loadProviderCredential(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  credentialId: string;
}) {
  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, input.organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, input.providerKind),
        eq(schema.organizationExternalTmsProviderCredentials.id, input.credentialId),
      ),
    )
    .limit(1);

  return credential ?? null;
}

class GlossaryConcordancePipeline extends ConcordancePipeline<
  AttachedGlossaryRecord,
  NormalizedGlossaryMatch
> {
  private glossaryMatchResolution?: GlossaryMatchResolution;

  withResolution(resolution?: GlossaryMatchResolution) {
    this.glossaryMatchResolution = resolution;
    return this;
  }

  protected defaultLimit() {
    return 20;
  }

  protected getResolution(input: ConcordanceQuery) {
    return (
      (input as GlossaryConcordanceQuery).glossaryMatchResolution ?? this.glossaryMatchResolution
    );
  }

  protected logLiveSearchFailure(
    error: unknown,
    input: ConcordanceQuery,
    organizationId: string,
    providerKind: ExternalTmsProviderKind,
  ) {
    glossaryLogger.error(
      { err: error, projectId: input.projectId, organizationId, providerKind },
      "Live glossary search failed; returning synced matches only",
    );
  }

  protected async loadAttached(projectId: string) {
    return db
      .select({
        id: schema.glossaries.id,
        name: schema.glossaries.name,
        source: schema.glossaries.source,
        externalProviderKind: schema.glossaries.externalProviderKind,
        externalGlossaryId: schema.glossaries.externalGlossaryId,
        externalProviderCredentialId: schema.glossaries.externalProviderCredentialId,
        externalProjectId: schema.glossaries.externalProjectId,
        targetLocale: schema.glossaries.targetLocale,
        termCapabilities: schema.glossaries.termCapabilities,
      })
      .from(schema.projectGlossaries)
      .innerJoin(schema.glossaries, eq(schema.projectGlossaries.glossaryId, schema.glossaries.id))
      .where(
        and(
          eq(schema.projectGlossaries.projectId, projectId),
          eq(schema.glossaries.status, "active"),
        ),
      );
  }

  protected async loadSynced(query: ConcordanceQuery, attached: AttachedGlossaryRecord[]) {
    const glossaryIds = attached.map((glossary) => glossary.id);
    const tsQuery = buildGlossaryTsQuery(query.sourceText);
    if (!tsQuery) {
      return [];
    }

    const limit = query.limit ?? 20;
    const dbMatches = await db
      .select({
        id: schema.glossaryTerms.id,
        glossaryId: schema.glossaryTerms.glossaryId,
        glossaryName: schema.glossaries.name,
        sourceTerm: schema.glossaryTerms.sourceTerm,
        targetTerm: schema.glossaryTerms.targetTerm,
        sourceLocale: schema.glossaries.sourceLocale,
        targetLocale: schema.glossaries.targetLocale,
        description: schema.glossaryTerms.description,
        forbidden: schema.glossaryTerms.forbidden,
        caseSensitive: schema.glossaryTerms.caseSensitive,
        externalKey: schema.glossaryTerms.externalKey,
        externalProviderKind: schema.glossaries.externalProviderKind,
        externalGlossaryId: schema.glossaries.externalGlossaryId,
        rank: sql<number>`ts_rank(${schema.glossaryTerms.searchVector}, to_tsquery('simple', ${tsQuery}))`.as(
          "rank",
        ),
      })
      .from(schema.glossaryTerms)
      .innerJoin(schema.glossaries, eq(schema.glossaryTerms.glossaryId, schema.glossaries.id))
      .where(
        and(
          inArray(schema.glossaryTerms.glossaryId, glossaryIds),
          eq(schema.glossaries.sourceLocale, query.sourceLocale),
          inArray(schema.glossaries.targetLocale, query.targetLocales),
          eq(schema.glossaries.status, "active"),
          eq(schema.glossaryTerms.reviewStatus, "approved"),
          sql`${schema.glossaryTerms.searchVector} @@ to_tsquery('simple', ${tsQuery})`,
        ),
      )
      .orderBy(desc(sql`rank`))
      .limit(limit);

    return dbMatches
      .filter((entry) =>
        sourceContainsTerm(query.sourceText, {
          sourceTerm: entry.sourceTerm,
          caseSensitive: entry.caseSensitive ?? false,
        }),
      )
      .map((entry) =>
        normalizeSyncedDatabaseGlossaryMatch({
          id: entry.id,
          glossaryId: entry.glossaryId,
          glossaryName: entry.glossaryName,
          sourceTerm: entry.sourceTerm,
          targetTerm: entry.targetTerm,
          sourceLocale: entry.sourceLocale,
          targetLocale: entry.targetLocale,
          description: entry.description,
          forbidden: entry.forbidden,
          caseSensitive: entry.caseSensitive,
          rank: Number(entry.rank) || 1,
          providerKind: entry.externalProviderKind,
          externalResourceId: entry.externalGlossaryId,
          externalTermId: entry.externalKey,
        }),
      );
  }

  protected coverageKey(glossary: AttachedGlossaryRecord, targetLocale: string) {
    return `${glossary.id}:${targetLocale}`;
  }

  protected matchCoverageKey(match: NormalizedGlossaryMatch) {
    return `${match.glossaryId}:${match.targetLocale}`;
  }

  protected filterLiveSearchable(
    attached: AttachedGlossaryRecord[],
    query: ConcordanceQuery,
    syncedCoveredKeys: Set<string>,
    resolution: unknown,
  ) {
    if (resolution === undefined) {
      return [];
    }

    return attached.filter(
      (glossary) =>
        supportsLiveGlossarySearch(glossary) &&
        query.targetLocales.some(
          (locale) => !syncedCoveredKeys.has(this.coverageKey(glossary, locale)!),
        ),
    );
  }

  protected async searchLive(input: {
    projectId: string;
    sourceLocale: string;
    targetLocales: string[];
    sourceText: string;
    limit?: number;
    attached: AttachedGlossaryRecord[];
    syncedCoveredKeys: Set<string>;
    organizationId: string;
    providerKind: ExternalTmsProviderKind;
    resolution: unknown;
  }) {
    const resolution = input.resolution as GlossaryMatchResolution;
    const matcher = resolution.getProviderGlossaryMatcher(input.providerKind);
    if (!matcher) {
      return [];
    }

    const project = await loadExternalTmsProject({
      organizationId: input.organizationId,
      projectId: input.projectId,
      providerKind: input.providerKind,
    });

    const credentialId =
      project?.externalProviderCredentialId ?? input.attached[0]?.externalProviderCredentialId;
    const externalProjectId = project?.externalProjectId ?? input.attached[0]?.externalProjectId;

    if (!credentialId || !externalProjectId) {
      return [];
    }

    const credential = await loadProviderCredential({
      organizationId: input.organizationId,
      providerKind: input.providerKind,
      credentialId,
    });
    if (!credential) {
      return [];
    }

    const secretMaterial = unwrapProviderCredentialCrypto(
      decryptProviderCredential({
        algorithm: credential.encryptionAlgorithm,
        keyVersion: credential.keyVersion,
        ciphertext: credential.ciphertext,
        iv: credential.iv,
        authTag: credential.authTag,
      }),
    );

    const searchableGlossaries = input.attached.filter(supportsLiveGlossarySearch);
    const limit = input.limit ?? 20;
    const liveMatches: NormalizedGlossaryMatch[] = [];

    for (const targetLocale of input.targetLocales) {
      const glossariesNeedingLive = searchableGlossaries.filter(
        (glossary) => !input.syncedCoveredKeys.has(`${glossary.id}:${targetLocale}`),
      );
      if (glossariesNeedingLive.length === 0) {
        continue;
      }

      const matches = await matcher({
        organizationId: input.organizationId,
        projectId: input.projectId,
        providerKind: input.providerKind,
        externalProjectId,
        credential,
        secretMaterial,
        glossaries: glossariesNeedingLive.map((glossary) => ({
          id: glossary.id,
          name: glossary.name,
          externalGlossaryId: glossary.externalGlossaryId,
          targetLocale: glossary.targetLocale,
          termCapabilities: glossary.termCapabilities,
        })),
        sourceLocale: input.sourceLocale,
        targetLocale,
        sourceText: input.sourceText,
        limit,
      });

      liveMatches.push(...matches.filter((match) => match.targetLocale === targetLocale));
    }

    return liveMatches;
  }

  protected merge(matches: NormalizedGlossaryMatch[], limit: number) {
    return mergeGlossaryMatches(matches, limit);
  }
}

type AttachedMemoryRecord = {
  id: string;
  name: string;
  source: (typeof schema.projectSourceEnum.enumValues)[number];
  capabilityMode: (typeof schema.externalTmsMemoryCapabilityModeEnum.enumValues)[number] | null;
  externalProviderKind: ExternalTmsProviderKind | null;
  externalMemoryId: string | null;
  externalProviderCredentialId: string | null;
  externalProjectId: string | null;
};

class TranslationMemoryConcordancePipeline extends ConcordancePipeline<
  AttachedMemoryRecord,
  NormalizedTranslationMemoryMatch
> {
  private memoryMatchResolution?: TranslationMemoryMatchResolution;

  withResolution(resolution?: TranslationMemoryMatchResolution) {
    this.memoryMatchResolution = resolution;
    return this;
  }

  protected defaultLimit() {
    return 10;
  }

  protected getResolution(input: ConcordanceQuery) {
    return (
      (input as MemoryConcordanceQuery).translationMemoryMatchResolution ??
      this.memoryMatchResolution
    );
  }

  protected logLiveSearchFailure(
    error: unknown,
    input: ConcordanceQuery,
    organizationId: string,
    providerKind: ExternalTmsProviderKind,
  ) {
    memoryLogger.error(
      { err: error, projectId: input.projectId, organizationId, providerKind },
      "Live translation memory search failed; returning synced matches only",
    );
  }

  protected async loadAttached(projectId: string) {
    return db
      .select({
        id: schema.memories.id,
        name: schema.memories.name,
        source: schema.memories.source,
        capabilityMode: schema.memories.capabilityMode,
        externalProviderKind: schema.memories.externalProviderKind,
        externalMemoryId: schema.memories.externalMemoryId,
        externalProviderCredentialId: schema.memories.externalProviderCredentialId,
        externalProjectId: schema.memories.externalProjectId,
      })
      .from(schema.projectMemories)
      .innerJoin(schema.memories, eq(schema.projectMemories.memoryId, schema.memories.id))
      .where(eq(schema.projectMemories.projectId, projectId));
  }

  protected async loadSynced(query: ConcordanceQuery, attached: AttachedMemoryRecord[]) {
    const searchableMemoryIds = attached
      .filter((memory) => memory.capabilityMode !== "reference_only")
      .map((memory) => memory.id);

    if (searchableMemoryIds.length === 0) {
      return [];
    }

    const memoryById = new Map(attached.map((memory) => [memory.id, memory]));
    const normalized = normalizeTranslationMemorySourceText(query.sourceText);
    const limit = query.limit ?? 10;

    const exactMatches = await db
      .select({
        id: schema.memoryEntries.id,
        memoryId: schema.memoryEntries.memoryId,
        sourceText: schema.memoryEntries.sourceText,
        targetText: schema.memoryEntries.targetText,
        sourceLocale: schema.memoryEntries.sourceLocale,
        targetLocale: schema.memoryEntries.targetLocale,
        provenance: schema.memoryEntries.provenance,
        matchScore: schema.memoryEntries.matchScore,
        externalKey: schema.memoryEntries.externalKey,
        rank: sql<number>`1`.as("rank"),
      })
      .from(schema.memoryEntries)
      .where(
        and(
          inArray(schema.memoryEntries.memoryId, searchableMemoryIds),
          eq(schema.memoryEntries.normalizedSourceText, normalized),
          eq(schema.memoryEntries.sourceLocale, query.sourceLocale),
          inArray(schema.memoryEntries.targetLocale, query.targetLocales),
          eq(schema.memoryEntries.reviewStatus, "approved"),
        ),
      )
      .limit(limit);

    const dbMatches =
      exactMatches.length > 0
        ? exactMatches
        : await (async () => {
            const tsQuery = buildTranslationMemoryTsQuery(query.sourceText);
            if (!tsQuery) {
              return [];
            }

            return db
              .select({
                id: schema.memoryEntries.id,
                memoryId: schema.memoryEntries.memoryId,
                sourceText: schema.memoryEntries.sourceText,
                targetText: schema.memoryEntries.targetText,
                sourceLocale: schema.memoryEntries.sourceLocale,
                targetLocale: schema.memoryEntries.targetLocale,
                provenance: schema.memoryEntries.provenance,
                matchScore: schema.memoryEntries.matchScore,
                externalKey: schema.memoryEntries.externalKey,
                rank: sql<number>`ts_rank(${schema.memoryEntries.searchVector}, to_tsquery('simple', ${tsQuery}))`.as(
                  "rank",
                ),
              })
              .from(schema.memoryEntries)
              .where(
                and(
                  inArray(schema.memoryEntries.memoryId, searchableMemoryIds),
                  eq(schema.memoryEntries.sourceLocale, query.sourceLocale),
                  inArray(schema.memoryEntries.targetLocale, query.targetLocales),
                  eq(schema.memoryEntries.reviewStatus, "approved"),
                  sql`${schema.memoryEntries.searchVector} @@ to_tsquery('simple', ${tsQuery})`,
                ),
              )
              .orderBy(desc(sql`rank`))
              .limit(limit);
          })();

    return dbMatches.map((entry) => {
      const memory = memoryById.get(entry.memoryId);
      return normalizeSyncedDatabaseTranslationMemoryMatch({
        id: entry.id,
        memoryId: entry.memoryId,
        memoryName: memory?.name ?? "Translation memory",
        sourceText: entry.sourceText,
        targetText: entry.targetText,
        sourceLocale: entry.sourceLocale,
        targetLocale: entry.targetLocale,
        matchScore: entry.matchScore,
        provenance: entry.provenance,
        rank: entry.rank,
        providerKind: memory?.externalProviderKind ?? null,
        externalResourceId: memory?.externalMemoryId ?? null,
        externalSegmentId: entry.externalKey,
      });
    });
  }

  protected coverageKey(memory: AttachedMemoryRecord, targetLocale: string) {
    return `${memory.id}:${targetLocale}`;
  }

  protected matchCoverageKey(match: NormalizedTranslationMemoryMatch) {
    return `${match.memoryId}:${match.targetLocale}`;
  }

  protected filterLiveSearchable(
    attached: AttachedMemoryRecord[],
    query: ConcordanceQuery,
    syncedCoveredKeys: Set<string>,
    resolution: unknown,
  ) {
    if (resolution === undefined) {
      return [];
    }

    const memoryResolution = resolution as TranslationMemoryMatchResolution;
    return attached.filter(
      (memory) =>
        memoryResolution.memorySupportsLiveSearch(memory) &&
        memory.externalProviderKind &&
        query.targetLocales.some((locale) => !syncedCoveredKeys.has(`${memory.id}:${locale}`)),
    );
  }

  protected async searchLive(input: {
    projectId: string;
    sourceLocale: string;
    targetLocales: string[];
    sourceText: string;
    limit?: number;
    attached: AttachedMemoryRecord[];
    syncedCoveredKeys: Set<string>;
    organizationId: string;
    providerKind: ExternalTmsProviderKind;
    resolution: unknown;
    externalJobUid?: string | null;
  }) {
    const resolution = input.resolution as TranslationMemoryMatchResolution;
    const matcher = resolution.getProviderTranslationMemoryMatcher(input.providerKind);
    if (!matcher) {
      return [];
    }

    const project = await loadExternalTmsProject({
      organizationId: input.organizationId,
      projectId: input.projectId,
      providerKind: input.providerKind,
    });

    const credentialId =
      project?.externalProviderCredentialId ?? input.attached[0]?.externalProviderCredentialId;
    const externalProjectId = project?.externalProjectId ?? input.attached[0]?.externalProjectId;

    if (!credentialId || !externalProjectId) {
      return [];
    }

    const credential = await loadProviderCredential({
      organizationId: input.organizationId,
      providerKind: input.providerKind,
      credentialId,
    });
    if (!credential) {
      return [];
    }

    const secretMaterial = unwrapProviderCredentialCrypto(
      decryptProviderCredential({
        algorithm: credential.encryptionAlgorithm,
        keyVersion: credential.keyVersion,
        ciphertext: credential.ciphertext,
        iv: credential.iv,
        authTag: credential.authTag,
      }),
    );

    const limit = input.limit ?? 10;
    const liveMatches: NormalizedTranslationMemoryMatch[] = [];

    for (const memory of input.attached) {
      if (!resolution.memorySupportsLiveSearch(memory)) {
        continue;
      }

      for (const targetLocale of input.targetLocales) {
        if (input.syncedCoveredKeys.has(`${memory.id}:${targetLocale}`)) {
          continue;
        }

        const matches = await matcher({
          organizationId: input.organizationId,
          projectId: input.projectId,
          providerKind: input.providerKind,
          externalProjectId,
          credential,
          secretMaterial,
          memory: {
            id: memory.id,
            name: memory.name,
            externalMemoryId: memory.externalMemoryId,
            capabilityMode: memory.capabilityMode,
          },
          sourceLocale: input.sourceLocale,
          targetLocale,
          sourceText: input.sourceText,
          limit,
          externalJobUid: input.externalJobUid,
          project: project?.providerMetadata
            ? {
                providerMetadata: project.providerMetadata,
                externalProjectId,
              }
            : undefined,
        });

        liveMatches.push(...matches.filter((match) => match.targetLocale === targetLocale));
      }
    }

    return liveMatches;
  }

  protected merge(matches: NormalizedTranslationMemoryMatch[], limit: number) {
    return mergeTranslationMemoryMatches(matches, limit);
  }
}

type GlossaryConcordanceQuery = ConcordanceQuery & {
  glossaryMatchResolution?: GlossaryMatchResolution;
};

type MemoryConcordanceQuery = ConcordanceQuery & {
  externalJobUid?: string | null;
  translationMemoryMatchResolution?: TranslationMemoryMatchResolution;
};

export class GlossaryConcordanceService {
  private readonly pipeline = new GlossaryConcordancePipeline();

  searchForContext(input: GlossaryConcordanceQuery) {
    return this.pipeline.withResolution(input.glossaryMatchResolution).search(input);
  }

  async collectUsageForUnits(input: {
    projectId: string;
    organizationId: string;
    providerKind?: ExternalTmsProviderKind;
    sourceLocale: string;
    targetLocales: string[];
    units: Array<{ externalStringId: string; key: string; sourceText: string }>;
    maxUnits?: number;
    glossaryMatchResolution?: GlossaryMatchResolution;
  }) {
    const sample = input.units
      .filter((unit) => unit.sourceText.trim().length > 0)
      .slice(0, input.maxUnits ?? 5);

    const usage: Array<{
      externalStringId: string;
      key: string;
      matches: AgentRunGlossaryMatchUsage[];
    }> = [];

    for (const unit of sample) {
      const matches = await this.searchForContext({
        projectId: input.projectId,
        organizationId: input.organizationId,
        providerKind: input.providerKind,
        sourceLocale: input.sourceLocale,
        targetLocales: input.targetLocales,
        sourceText: unit.sourceText,
        glossaryMatchResolution: input.glossaryMatchResolution,
      });

      if (matches.length === 0) {
        continue;
      }

      usage.push({
        externalStringId: unit.externalStringId,
        key: unit.key,
        matches: matches.map(toAgentRunGlossaryMatchUsage),
      });
    }

    return usage;
  }
}

export class TranslationMemoryConcordanceService {
  private readonly pipeline = new TranslationMemoryConcordancePipeline();

  searchForContext(input: MemoryConcordanceQuery) {
    return this.pipeline.withResolution(input.translationMemoryMatchResolution).search(input);
  }

  async collectUsageForUnits(input: {
    projectId: string;
    organizationId: string;
    providerKind?: ExternalTmsProviderKind;
    sourceLocale: string;
    targetLocales: string[];
    units: Array<{ externalStringId: string; key: string; sourceText: string }>;
    maxUnits?: number;
    translationMemoryMatchResolution?: TranslationMemoryMatchResolution;
  }) {
    const sample = input.units
      .filter((unit) => unit.sourceText.trim().length > 0)
      .slice(0, input.maxUnits ?? 5);

    const usage: Array<{
      externalStringId: string;
      key: string;
      matches: AgentRunTranslationMemoryMatchUsage[];
    }> = [];

    for (const unit of sample) {
      const matches = await this.searchForContext({
        projectId: input.projectId,
        organizationId: input.organizationId,
        providerKind: input.providerKind,
        sourceLocale: input.sourceLocale,
        targetLocales: input.targetLocales,
        sourceText: unit.sourceText,
        translationMemoryMatchResolution: input.translationMemoryMatchResolution,
      });

      if (matches.length === 0) {
        continue;
      }

      usage.push({
        externalStringId: unit.externalStringId,
        key: unit.key,
        matches: matches.map(toAgentRunTranslationMemoryMatchUsage),
      });
    }

    return usage;
  }
}

export async function loadGlossaryMatchesForContext(input: GlossaryConcordanceQuery) {
  return new GlossaryConcordanceService().searchForContext(input);
}

export async function loadTranslationMemoryMatchesForContext(input: MemoryConcordanceQuery) {
  return new TranslationMemoryConcordanceService().searchForContext(input);
}

export async function collectGlossaryUsageForUnits(
  input: Parameters<GlossaryConcordanceService["collectUsageForUnits"]>[0],
) {
  return new GlossaryConcordanceService().collectUsageForUnits(input);
}

export async function collectTranslationMemoryUsageForUnits(
  input: Parameters<TranslationMemoryConcordanceService["collectUsageForUnits"]>[0],
) {
  return new TranslationMemoryConcordanceService().collectUsageForUnits(input);
}

export { buildGlossaryTsQuery, buildTranslationMemoryTsQuery };
