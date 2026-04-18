import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type {
  LlmProvider,
  OrganizationLlmProviderCredential,
  OrganizationMembershipRole,
} from "@/lib/database/types";
import { isSupportedModelForProvider } from "@/lib/providers/catalog";
import { validateProviderCredential } from "@/lib/providers/validation";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  maskProviderCredentialSuffix,
} from "@/lib/security/provider-credential-crypto";

export type OrganizationProviderCredentialSummary = {
  organizationId: string;
  provider: LlmProvider;
  defaultModel: string;
  maskedApiKeySuffix: string;
  lastValidatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

function isProviderCredentialAdmin(role: OrganizationMembershipRole) {
  return role === "owner" || role === "admin";
}

export function assertProviderCredentialAdmin(role: OrganizationMembershipRole) {
  if (!isProviderCredentialAdmin(role)) {
    throw new Error("forbidden");
  }
}

async function getCredentialByOrganizationId(organizationId: string) {
  const [credential] = await db
    .select()
    .from(schema.organizationLlmProviderCredentials)
    .where(eq(schema.organizationLlmProviderCredentials.organizationId, organizationId))
    .limit(1);

  return credential ?? null;
}

export async function getOrganizationProviderCredentialSummary(organizationId: string) {
  const credential = await getCredentialByOrganizationId(organizationId);

  if (!credential) {
    return null;
  }

  return summarizeCredential(credential);
}

function summarizeCredential(credential: OrganizationLlmProviderCredential) {
  return {
    organizationId: credential.organizationId,
    provider: credential.provider,
    defaultModel: credential.defaultModel,
    maskedApiKeySuffix: credential.maskedApiKeySuffix,
    lastValidatedAt: credential.lastValidatedAt,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
  } satisfies OrganizationProviderCredentialSummary;
}

export async function upsertOrganizationProviderCredential(input: {
  organizationId: string;
  userId: string;
  provider: LlmProvider;
  apiKey: string;
  defaultModel: string;
}) {
  if (!isSupportedModelForProvider(input.provider, input.defaultModel)) {
    throw new Error("unsupported_provider_model");
  }

  await validateProviderCredential({
    provider: input.provider,
    apiKey: input.apiKey,
    model: input.defaultModel,
  });

  const now = new Date();
  const encrypted = encryptProviderCredential(input.apiKey);
  const [credential] = await db
    .insert(schema.organizationLlmProviderCredentials)
    .values({
      organizationId: input.organizationId,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      provider: input.provider,
      defaultModel: input.defaultModel,
      maskedApiKeySuffix: maskProviderCredentialSuffix(input.apiKey),
      encryptionAlgorithm: encrypted.algorithm,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      lastValidatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.organizationLlmProviderCredentials.organizationId,
      set: {
        updatedByUserId: input.userId,
        provider: input.provider,
        defaultModel: input.defaultModel,
        maskedApiKeySuffix: maskProviderCredentialSuffix(input.apiKey),
        encryptionAlgorithm: encrypted.algorithm,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion,
        lastValidatedAt: now,
        updatedAt: now,
      },
    })
    .returning();

  return summarizeCredential(credential);
}

export async function revealOrganizationProviderCredential(input: {
  organizationId: string;
  role: OrganizationMembershipRole;
}) {
  assertProviderCredentialAdmin(input.role);

  const credential = await getCredentialByOrganizationId(input.organizationId);
  if (!credential) {
    return null;
  }

  return {
    summary: summarizeCredential(credential),
    apiKey: decryptProviderCredential({
      algorithm: credential.encryptionAlgorithm,
      keyVersion: credential.keyVersion,
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.authTag,
    }),
  };
}

export async function deleteOrganizationProviderCredential(input: {
  organizationId: string;
  role: OrganizationMembershipRole;
}) {
  assertProviderCredentialAdmin(input.role);

  const deleted = await db
    .delete(schema.organizationLlmProviderCredentials)
    .where(eq(schema.organizationLlmProviderCredentials.organizationId, input.organizationId))
    .returning({ id: schema.organizationLlmProviderCredentials.id });

  return deleted.length > 0;
}

export async function getOrganizationProviderCredentialBySlugAndUser(input: {
  organizationSlug: string;
  localUserId: string;
}) {
  const [credential] = await db
    .select({
      provider: schema.organizationLlmProviderCredentials.provider,
      defaultModel: schema.organizationLlmProviderCredentials.defaultModel,
      maskedApiKeySuffix: schema.organizationLlmProviderCredentials.maskedApiKeySuffix,
      lastValidatedAt: schema.organizationLlmProviderCredentials.lastValidatedAt,
      createdAt: schema.organizationLlmProviderCredentials.createdAt,
      updatedAt: schema.organizationLlmProviderCredentials.updatedAt,
      organizationId: schema.organizationLlmProviderCredentials.organizationId,
      membershipRole: schema.organizationMemberships.role,
    })
    .from(schema.organizationLlmProviderCredentials)
    .innerJoin(
      schema.organizations,
      eq(schema.organizationLlmProviderCredentials.organizationId, schema.organizations.id),
    )
    .innerJoin(
      schema.organizationMemberships,
      and(
        eq(schema.organizationMemberships.organizationId, schema.organizations.id),
        eq(schema.organizationMemberships.userId, input.localUserId),
      ),
    )
    .where(eq(schema.organizations.slug, input.organizationSlug))
    .limit(1);

  return credential ?? null;
}
