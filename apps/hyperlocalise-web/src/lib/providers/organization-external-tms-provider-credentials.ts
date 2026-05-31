import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { assertCapability } from "@/api/auth/policy";
import { db, schema } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  maskProviderCredentialSuffix,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import {
  getTmsProviderCapability,
  type TmsProviderCapability,
  type TmsProviderCapabilityAction,
} from "@/lib/providers/tms-capabilities";
import { listProviderWebhookSubscriptionSummaries } from "@/lib/providers/provider-webhook-subscription-manager";
import type { ProviderWebhookSubscriptionSummary } from "@/lib/providers/provider-webhook-subscription-types";
import { assertProviderUrlResolvable } from "@/lib/providers/provider-url-resolve";
import { normalizeProviderBaseUrl } from "@/lib/providers/provider-url-safety";
import { resolvePhraseBaseUrl } from "@/lib/providers/phrase/phrase-base-url";

export type ExternalTmsProviderKind = "crowdin" | "smartling" | "phrase" | "lokalise";

export function assertExternalTmsCredentialAdmin(role: OrganizationMembershipRole) {
  assertCapability(role, "provider_credentials:write");
}

export type ExternalTmsProviderCredentialSummary = {
  id: string;
  providerKind: ExternalTmsProviderKind;
  displayName: string;
  region: string | null;
  baseUrl: string | null;
  validationStatus: string;
  validationMessage: string | null;
  lastValidatedAt: string | null;
  maskedSecretSuffix: string;
  createdAt: string;
  updatedAt: string;
};

export type ExternalTmsProviderCredentialListItem = ExternalTmsProviderCredentialSummary & {
  lastSuccessfulSyncAt: string | null;
  projectCount: number;
  capabilities: Record<TmsProviderCapabilityAction, TmsProviderCapability>;
  webhookSubscriptions: ProviderWebhookSubscriptionSummary[];
};

function summarizeExternalCredential(
  credential: typeof schema.organizationExternalTmsProviderCredentials.$inferSelect,
): ExternalTmsProviderCredentialSummary {
  return {
    id: credential.id,
    providerKind: credential.providerKind as ExternalTmsProviderKind,
    displayName: credential.displayName,
    region: credential.region,
    baseUrl: credential.baseUrl,
    validationStatus: credential.validationStatus,
    validationMessage: credential.validationMessage,
    lastValidatedAt: credential.lastValidatedAt?.toISOString() ?? null,
    maskedSecretSuffix: credential.maskedSecretSuffix,
    createdAt: credential.createdAt.toISOString(),
    updatedAt: credential.updatedAt.toISOString(),
  };
}

export async function listOrganizationExternalTmsProviderCredentialSummaries(
  organizationId: string,
): Promise<ExternalTmsProviderCredentialSummary[]> {
  const credentials = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(eq(schema.organizationExternalTmsProviderCredentials.organizationId, organizationId));

  return credentials.map(summarizeExternalCredential);
}

export async function listOrganizationExternalTmsProviderCredentialDetails(
  organizationId: string,
): Promise<ExternalTmsProviderCredentialListItem[]> {
  const credentials = await listOrganizationExternalTmsProviderCredentialSummaries(organizationId);
  if (credentials.length === 0) {
    return [];
  }

  const providerKinds = credentials.map((c) => c.providerKind);

  const [projectCounts, lastSyncs, webhookSubscriptions] = await Promise.all([
    db
      .select({
        providerKind: schema.projects.externalProviderKind,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.organizationId, organizationId),
          eq(schema.projects.source, "external_tms"),
          eq(schema.projects.isActive, true),
          inArray(schema.projects.externalProviderKind, providerKinds),
        ),
      )
      .groupBy(schema.projects.externalProviderKind),
    db
      .select({
        providerKind: schema.providerSyncRuns.providerKind,
        completedAt: sql<Date | null>`max(${schema.providerSyncRuns.completedAt})`.mapWith((v) =>
          v == null ? null : new Date(v),
        ),
      })
      .from(schema.providerSyncRuns)
      .where(
        and(
          eq(schema.providerSyncRuns.organizationId, organizationId),
          eq(schema.providerSyncRuns.status, "succeeded"),
          ne(schema.providerSyncRuns.kind, "health_check"),
          inArray(schema.providerSyncRuns.providerKind, providerKinds),
        ),
      )
      .groupBy(schema.providerSyncRuns.providerKind),
    Promise.all(
      credentials.map((credential) =>
        listProviderWebhookSubscriptionSummaries({
          organizationId,
          providerCredentialId: credential.id,
        }),
      ),
    ),
  ]);

  const projectCountByProvider = Object.fromEntries(
    projectCounts.map((row) => [row.providerKind, row.count]),
  ) as Record<string, number>;

  const lastSyncByProvider = Object.fromEntries(
    lastSyncs.map((row) => [row.providerKind, row.completedAt?.toISOString() ?? null]),
  ) as Record<string, string | null>;

  return credentials.map((credential, index) => ({
    ...credential,
    lastSuccessfulSyncAt: lastSyncByProvider[credential.providerKind] ?? null,
    projectCount: projectCountByProvider[credential.providerKind] ?? 0,
    capabilities: getTmsProviderCapability(credential.providerKind).capabilities,
    webhookSubscriptions: webhookSubscriptions[index] ?? [],
  }));
}

export async function getOrganizationExternalTmsProviderCredentialSummaryById(
  organizationId: string,
  credentialId: string,
) {
  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.id, credentialId),
      ),
    )
    .limit(1);

  return credential ? summarizeExternalCredential(credential) : null;
}

export async function getOrganizationExternalTmsProviderCredentialSummary(
  organizationId: string,
  providerKind: ExternalTmsProviderKind,
) {
  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, providerKind),
      ),
    )
    .limit(1);

  return credential ? summarizeExternalCredential(credential) : null;
}

export async function upsertOrganizationExternalTmsProviderCredential(input: {
  organizationId: string;
  userId: string;
  role: OrganizationMembershipRole;
  providerKind: ExternalTmsProviderKind;
  displayName: string;
  secretMaterial: string;
  region?: string | null;
  baseUrl?: string | null;
}) {
  assertExternalTmsCredentialAdmin(input.role);

  const now = new Date();
  const encrypted = unwrapProviderCredentialCrypto(encryptProviderCredential(input.secretMaterial));
  const baseUrl = await normalizeExternalTmsCredentialBaseUrl({
    providerKind: input.providerKind,
    region: input.region ?? null,
    baseUrl: input.baseUrl ?? null,
  });
  const [credential] = await db
    .insert(schema.organizationExternalTmsProviderCredentials)
    .values({
      organizationId: input.organizationId,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      providerKind: input.providerKind,
      displayName: input.displayName,
      region: input.region ?? null,
      baseUrl,
      validationStatus: "unvalidated",
      encryptionAlgorithm: encrypted.algorithm,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      maskedSecretSuffix: maskProviderCredentialSuffix(input.secretMaterial),
    })
    .onConflictDoUpdate({
      target: [
        schema.organizationExternalTmsProviderCredentials.organizationId,
        schema.organizationExternalTmsProviderCredentials.providerKind,
      ],
      set: {
        updatedByUserId: input.userId,
        displayName: input.displayName,
        region: input.region ?? null,
        baseUrl,
        validationStatus: "unvalidated",
        validationMessage: null,
        lastValidatedAt: null,
        encryptionAlgorithm: encrypted.algorithm,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion,
        maskedSecretSuffix: maskProviderCredentialSuffix(input.secretMaterial),
        updatedAt: now,
      },
    })
    .returning();

  return credential;
}

async function normalizeExternalTmsCredentialBaseUrl(input: {
  providerKind: ExternalTmsProviderKind;
  region: string | null;
  baseUrl: string | null;
}) {
  if (!input.baseUrl?.trim()) return null;

  const defaultBaseUrl = getExternalTmsDefaultBaseUrl(input.providerKind, input.region);
  const normalized = normalizeProviderBaseUrl(input.baseUrl, defaultBaseUrl);
  if (!normalized) {
    throw new Error("provider_base_url_invalid");
  }

  await assertProviderUrlResolvable(normalized);
  return normalized;
}

function getExternalTmsDefaultBaseUrl(
  providerKind: ExternalTmsProviderKind,
  region: string | null,
) {
  switch (providerKind) {
    case "crowdin":
      return "https://api.crowdin.com/api/v2";
    case "phrase":
      return resolvePhraseBaseUrl({ region });
    case "lokalise":
      return "https://api.lokalise.com/api2";
    case "smartling":
      return "https://api.smartling.com/auth-api/v2";
  }
}

export async function revealOrganizationExternalTmsProviderCredential(input: {
  organizationId: string;
  role: OrganizationMembershipRole;
  providerKind: ExternalTmsProviderKind;
}) {
  assertExternalTmsCredentialAdmin(input.role);

  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, input.organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, input.providerKind),
      ),
    )
    .limit(1);

  if (!credential) return null;

  return {
    summary: credential,
    secretMaterial: unwrapProviderCredentialCrypto(
      decryptProviderCredential({
        algorithm: credential.encryptionAlgorithm,
        keyVersion: credential.keyVersion,
        ciphertext: credential.ciphertext,
        iv: credential.iv,
        authTag: credential.authTag,
      }),
    ),
  };
}

export async function deleteOrganizationExternalTmsProviderCredential(input: {
  organizationId: string;
  role: OrganizationMembershipRole;
  providerKind: ExternalTmsProviderKind;
}) {
  assertExternalTmsCredentialAdmin(input.role);

  const deleted = await db
    .delete(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, input.organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, input.providerKind),
      ),
    )
    .returning({ id: schema.organizationExternalTmsProviderCredentials.id });

  return deleted.length > 0;
}
