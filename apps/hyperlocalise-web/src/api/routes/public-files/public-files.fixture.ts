import { createHash, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import {
  encryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

import { createMemoryFileStorageAdapter } from "../file/file.fixture";

export { createMemoryFileStorageAdapter };

const createdWorkosOrganizationIds = new Set<string>();
const createdWorkosUserIds = new Set<string>();

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export async function createPublicApiFixture() {
  const suffix = randomUUID();
  const workosOrganizationId = `org_${suffix}`;
  const workosUserId = `user_${suffix}`;
  const apiKey = `hl_${suffix.replaceAll("-", "")}`;

  createdWorkosOrganizationIds.add(workosOrganizationId);
  createdWorkosUserIds.add(workosUserId);

  const [organization] = await db
    .insert(schema.organizations)
    .values({
      workosOrganizationId,
      name: `Example Org ${suffix}`,
      slug: `example-org-${suffix}`,
    })
    .returning();

  const [user] = await db
    .insert(schema.users)
    .values({
      workosUserId,
      email: `${suffix}@example.com`,
    })
    .returning();

  await db.insert(schema.organizationMemberships).values({
    organizationId: organization.id,
    userId: user.id,
    role: "admin",
    workosMembershipId: `om_${suffix}`,
  });

  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${suffix}`,
      organizationId: organization.id,
      createdByUserId: user.id,
      name: "Marketing Site",
      description: "Primary website strings",
    })
    .returning();

  await db.insert(schema.organizationApiKeys).values({
    organizationId: organization.id,
    name: "Public API Test Key",
    keyHash: hashApiKey(apiKey),
    keyPrefix: apiKey.slice(0, 8),
    permissions: ["jobs:read", "jobs:write", "files:read", "files:write"],
    createdByUserId: user.id,
  });

  return { apiKey, project };
}

export async function createExternalTmsPublicApiFixture(
  providerKind: ExternalTmsProviderKind = "phrase",
) {
  const fixture = await createPublicApiFixture();
  const encrypted = unwrapProviderCredentialCrypto(encryptProviderCredential("provider-token"));
  const [credential] = await db
    .insert(schema.organizationExternalTmsProviderCredentials)
    .values({
      organizationId: fixture.project.organizationId,
      createdByUserId: fixture.project.createdByUserId,
      providerKind,
      displayName: `${providerKind} test credential`,
      authMode: "api_token",
      encryptionAlgorithm: encrypted.algorithm,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      maskedSecretSuffix: "token",
    })
    .returning();

  const externalProjectId = "external-project-1";
  const externalProjectCanonicalId = `ext:${providerKind}:${externalProjectId}`;
  const [project] = await db
    .update(schema.projects)
    .set({
      id: externalProjectCanonicalId,
      source: "external_tms",
      externalProviderKind: providerKind,
      externalProviderCredentialId: credential.id,
      externalProjectId,
      sourceLocale: "en",
      targetLocales: ["fr"],
    })
    .where(eq(schema.projects.id, fixture.project.id))
    .returning();

  return { ...fixture, project, credential, externalProjectId };
}

export async function cleanupPublicApiFixture() {
  for (const workosOrganizationId of createdWorkosOrganizationIds) {
    await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.workosOrganizationId, workosOrganizationId));
  }

  for (const workosUserId of createdWorkosUserIds) {
    await db.delete(schema.users).where(eq(schema.users.workosUserId, workosUserId));
  }

  createdWorkosOrganizationIds.clear();
  createdWorkosUserIds.clear();
}
