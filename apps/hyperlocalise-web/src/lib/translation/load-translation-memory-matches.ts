import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { createLogger } from "@/lib/log";
import { decryptProviderCredential } from "@/lib/security/provider-credential-crypto";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import { memorySupportsLiveSearch } from "@/lib/providers/lokalise/lokalise-tm-matcher";
import { getProviderTranslationMemoryMatcher } from "@/lib/providers/provider-translation-memory-matchers";
import { loadSyncedTranslationMemoryMatchesForContext } from "@/lib/translation/load-synced-translation-memory-matches";
import {
  mergeTranslationMemoryMatches,
  toAgentRunTranslationMemoryMatchUsage,
  type AgentRunTranslationMemoryMatchUsage,
  type NormalizedTranslationMemoryMatch,
} from "@/lib/translation/translation-memory-match";

const logger = createLogger("translation-memory-matches");

function syncedCoverageKey(memoryId: string, targetLocale: string) {
  return `${memoryId}:${targetLocale}`;
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

async function loadAttachedMemoriesForProject(projectId: string): Promise<AttachedMemoryRecord[]> {
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

async function searchLiveProviderMatches(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  credentialId: string;
  memories: AttachedMemoryRecord[];
  syncedCoveredKeys: Set<string>;
  sourceLocale: string;
  targetLocales: string[];
  sourceText: string;
  limit: number;
  externalJobUid?: string | null;
  projectMetadata?: Record<string, unknown>;
}): Promise<NormalizedTranslationMemoryMatch[]> {
  const matcher = getProviderTranslationMemoryMatcher(input.providerKind);
  if (!matcher) {
    return [];
  }

  const credential = await loadProviderCredential({
    organizationId: input.organizationId,
    providerKind: input.providerKind,
    credentialId: input.credentialId,
  });
  if (!credential) {
    return [];
  }

  const secretMaterial = decryptProviderCredential({
    algorithm: credential.encryptionAlgorithm,
    keyVersion: credential.keyVersion,
    ciphertext: credential.ciphertext,
    iv: credential.iv,
    authTag: credential.authTag,
  });

  const liveMatches: NormalizedTranslationMemoryMatch[] = [];

  for (const memory of input.memories) {
    if (!memorySupportsLiveSearch(memory)) {
      continue;
    }

    for (const targetLocale of input.targetLocales) {
      if (input.syncedCoveredKeys.has(syncedCoverageKey(memory.id, targetLocale))) {
        continue;
      }

      const matches = await matcher({
        organizationId: input.organizationId,
        projectId: input.projectId,
        providerKind: input.providerKind,
        externalProjectId: input.externalProjectId,
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
        limit: input.limit,
        externalJobUid: input.externalJobUid,
        project: input.projectMetadata
          ? {
              providerMetadata: input.projectMetadata,
              externalProjectId: input.externalProjectId,
            }
          : undefined,
      });

      liveMatches.push(...matches.filter((match) => match.targetLocale === targetLocale));
    }
  }

  return liveMatches;
}

async function resolveProjectOrganizationId(projectId: string) {
  const [project] = await db
    .select({
      organizationId: schema.projects.organizationId,
      externalProviderKind: schema.projects.externalProviderKind,
    })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);

  return project ?? null;
}

export async function loadTranslationMemoryMatchesForContext(input: {
  projectId: string;
  organizationId?: string;
  providerKind?: ExternalTmsProviderKind;
  externalJobUid?: string | null;
  sourceLocale: string;
  targetLocales: string[];
  sourceText: string;
  limit?: number;
}): Promise<NormalizedTranslationMemoryMatch[]> {
  const limit = input.limit ?? 10;
  const projectContext =
    input.organizationId && input.providerKind
      ? null
      : await resolveProjectOrganizationId(input.projectId);
  const organizationId = input.organizationId ?? projectContext?.organizationId;
  const providerKind = input.providerKind ?? projectContext?.externalProviderKind ?? undefined;

  const attachedMemories = await loadAttachedMemoriesForProject(input.projectId);
  if (attachedMemories.length === 0) {
    return [];
  }

  const searchableMemoryIds = attachedMemories
    .filter((memory) => memory.capabilityMode !== "reference_only")
    .map((memory) => memory.id);

  if (searchableMemoryIds.length === 0) {
    return [];
  }

  const syncedMatches = await loadSyncedTranslationMemoryMatchesForContext({
    projectId: input.projectId,
    memoryIds: searchableMemoryIds,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    sourceText: input.sourceText,
    limit,
  });

  const syncedCoveredKeys = new Set(
    syncedMatches.map((match) => syncedCoverageKey(match.memoryId, match.targetLocale)),
  );
  const liveSearchMemories = attachedMemories.filter(
    (memory) =>
      memorySupportsLiveSearch(memory) &&
      memory.externalProviderKind &&
      input.targetLocales.some(
        (locale) => !syncedCoveredKeys.has(syncedCoverageKey(memory.id, locale)),
      ),
  );

  if (liveSearchMemories.length === 0 || !organizationId || !providerKind) {
    return mergeTranslationMemoryMatches(syncedMatches, limit);
  }

  const project = await loadExternalTmsProject({
    organizationId,
    projectId: input.projectId,
    providerKind,
  });

  const credentialId =
    project?.externalProviderCredentialId ?? liveSearchMemories[0]?.externalProviderCredentialId;
  const externalProjectId = project?.externalProjectId ?? liveSearchMemories[0]?.externalProjectId;

  if (!credentialId || !externalProjectId) {
    return mergeTranslationMemoryMatches(syncedMatches, limit);
  }

  let liveMatches: NormalizedTranslationMemoryMatch[] = [];
  try {
    const projectRecord = project;

    liveMatches = await searchLiveProviderMatches({
      organizationId,
      projectId: input.projectId,
      providerKind,
      externalProjectId,
      credentialId,
      memories: liveSearchMemories,
      syncedCoveredKeys,
      sourceLocale: input.sourceLocale,
      targetLocales: input.targetLocales,
      sourceText: input.sourceText,
      limit,
      externalJobUid: input.externalJobUid,
      projectMetadata: projectRecord?.providerMetadata ?? undefined,
    });
  } catch (error) {
    logger.error(
      {
        err: error,
        projectId: input.projectId,
        organizationId,
        providerKind,
      },
      "Live translation memory search failed; returning synced matches only",
    );
    return mergeTranslationMemoryMatches(syncedMatches, limit);
  }

  return mergeTranslationMemoryMatches([...syncedMatches, ...liveMatches], limit);
}

export async function collectTranslationMemoryUsageForUnits(input: {
  projectId: string;
  organizationId: string;
  providerKind?: ExternalTmsProviderKind;
  sourceLocale: string;
  targetLocales: string[];
  units: Array<{ externalStringId: string; key: string; sourceText: string }>;
  maxUnits?: number;
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
    const matches = await loadTranslationMemoryMatchesForContext({
      projectId: input.projectId,
      organizationId: input.organizationId,
      providerKind: input.providerKind,
      sourceLocale: input.sourceLocale,
      targetLocales: input.targetLocales,
      sourceText: unit.sourceText,
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
