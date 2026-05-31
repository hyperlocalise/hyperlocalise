import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { createLogger } from "@/lib/log";
import {
  decryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import { getProviderGlossaryMatcher } from "@/lib/providers/provider-glossary-matchers";
import { loadSyncedGlossaryMatchesForContext } from "@/lib/translation/load-synced-glossary-matches";
import {
  mergeGlossaryMatches,
  toAgentRunGlossaryMatchUsage,
  type AgentRunGlossaryMatchUsage,
  type NormalizedGlossaryMatch,
} from "@/lib/translation/glossary-match";

const logger = createLogger("glossary-matches");

function syncedCoverageKey(glossaryId: string, targetLocale: string) {
  return `${glossaryId}:${targetLocale}`;
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

async function loadAttachedGlossariesForProject(
  projectId: string,
): Promise<AttachedGlossaryRecord[]> {
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
  glossaries: AttachedGlossaryRecord[];
  syncedCoveredKeys: Set<string>;
  sourceLocale: string;
  targetLocales: string[];
  sourceText: string;
  limit: number;
}): Promise<NormalizedGlossaryMatch[]> {
  const matcher = getProviderGlossaryMatcher(input.providerKind);
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

  const secretMaterial = unwrapProviderCredentialCrypto(
    decryptProviderCredential({
      algorithm: credential.encryptionAlgorithm,
      keyVersion: credential.keyVersion,
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.authTag,
    }),
  );

  const searchableGlossaries = input.glossaries.filter(supportsLiveGlossarySearch);
  if (searchableGlossaries.length === 0) {
    return [];
  }

  const liveMatches: NormalizedGlossaryMatch[] = [];

  for (const targetLocale of input.targetLocales) {
    const glossariesNeedingLive = searchableGlossaries.filter(
      (glossary) => !input.syncedCoveredKeys.has(syncedCoverageKey(glossary.id, targetLocale)),
    );
    if (glossariesNeedingLive.length === 0) {
      continue;
    }

    const matches = await matcher({
      organizationId: input.organizationId,
      projectId: input.projectId,
      providerKind: input.providerKind,
      externalProjectId: input.externalProjectId,
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
      limit: input.limit,
    });

    liveMatches.push(...matches.filter((match) => match.targetLocale === targetLocale));
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

export async function loadGlossaryMatchesForContext(input: {
  projectId: string;
  organizationId?: string;
  providerKind?: ExternalTmsProviderKind;
  sourceLocale: string;
  targetLocales: string[];
  sourceText: string;
  limit?: number;
}): Promise<NormalizedGlossaryMatch[]> {
  const limit = input.limit ?? 20;
  const projectContext =
    input.organizationId && input.providerKind
      ? null
      : await resolveProjectOrganizationId(input.projectId);
  const organizationId = input.organizationId ?? projectContext?.organizationId;
  const providerKind = input.providerKind ?? projectContext?.externalProviderKind ?? undefined;

  const attachedGlossaries = await loadAttachedGlossariesForProject(input.projectId);
  if (attachedGlossaries.length === 0) {
    return [];
  }

  const glossaryIds = attachedGlossaries.map((glossary) => glossary.id);

  const syncedMatches = await loadSyncedGlossaryMatchesForContext({
    projectId: input.projectId,
    glossaryIds,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    sourceText: input.sourceText,
    limit,
  });

  const syncedCoveredKeys = new Set(
    syncedMatches.map((match) => syncedCoverageKey(match.glossaryId, match.targetLocale)),
  );

  const liveSearchGlossaries = attachedGlossaries.filter(
    (glossary) =>
      supportsLiveGlossarySearch(glossary) &&
      input.targetLocales.some(
        (locale) => !syncedCoveredKeys.has(syncedCoverageKey(glossary.id, locale)),
      ),
  );

  if (liveSearchGlossaries.length === 0 || !organizationId || !providerKind) {
    return mergeGlossaryMatches(syncedMatches, limit);
  }

  const project = await loadExternalTmsProject({
    organizationId,
    projectId: input.projectId,
    providerKind,
  });

  const credentialId =
    project?.externalProviderCredentialId ?? liveSearchGlossaries[0]?.externalProviderCredentialId;
  const externalProjectId =
    project?.externalProjectId ?? liveSearchGlossaries[0]?.externalProjectId;

  if (!credentialId || !externalProjectId) {
    return mergeGlossaryMatches(syncedMatches, limit);
  }

  let liveMatches: NormalizedGlossaryMatch[] = [];
  try {
    liveMatches = await searchLiveProviderMatches({
      organizationId,
      projectId: input.projectId,
      providerKind,
      externalProjectId,
      credentialId,
      glossaries: liveSearchGlossaries,
      syncedCoveredKeys,
      sourceLocale: input.sourceLocale,
      targetLocales: input.targetLocales,
      sourceText: input.sourceText,
      limit,
    });
  } catch (error) {
    logger.error(
      {
        err: error,
        projectId: input.projectId,
        organizationId,
        providerKind,
      },
      "Live glossary search failed; returning synced matches only",
    );
    return mergeGlossaryMatches(syncedMatches, limit);
  }

  return mergeGlossaryMatches([...syncedMatches, ...liveMatches], limit);
}

export async function collectGlossaryUsageForUnits(input: {
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
    matches: AgentRunGlossaryMatchUsage[];
  }> = [];

  for (const unit of sample) {
    const matches = await loadGlossaryMatchesForContext({
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
      matches: matches.map(toAgentRunGlossaryMatchUsage),
    });
  }

  return usage;
}
