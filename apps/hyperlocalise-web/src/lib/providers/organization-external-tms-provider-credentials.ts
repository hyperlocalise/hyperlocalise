import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  maskProviderCredentialSuffix,
} from "@/lib/security/provider-credential-crypto";

export type ExternalTmsProviderKind = "crowdin" | "smartling" | "phrase" | "lokalise";

export function assertExternalTmsCredentialAdmin(role: OrganizationMembershipRole) {
  if (role !== "owner" && role !== "admin") {
    throw new Error("forbidden");
  }
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

  return credential ?? null;
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
  const encrypted = encryptProviderCredential(input.secretMaterial);
  const [credential] = await db
    .insert(schema.organizationExternalTmsProviderCredentials)
    .values({
      organizationId: input.organizationId,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      providerKind: input.providerKind,
      displayName: input.displayName,
      region: input.region ?? null,
      baseUrl: input.baseUrl ?? null,
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
        baseUrl: input.baseUrl ?? null,
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
    secretMaterial: decryptProviderCredential({
      algorithm: credential.encryptionAlgorithm,
      keyVersion: credential.keyVersion,
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.authTag,
    }),
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
