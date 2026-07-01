import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import {
  decryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

export type CrowdinProjectCredential = {
  externalProjectId: string;
  credential: typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
};

export async function loadCrowdinProjectCredential(input: {
  organizationId: string;
  projectId: string;
}): Promise<CrowdinProjectCredential | null> {
  const [project] = await db
    .select({
      externalProjectId: schema.projects.externalProjectId,
      externalProviderCredentialId: schema.projects.externalProviderCredentialId,
      externalProviderKind: schema.projects.externalProviderKind,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.externalProviderKind, "crowdin"),
        eq(schema.projects.source, "external_tms"),
      ),
    )
    .limit(1);

  if (!project?.externalProjectId || !project.externalProviderCredentialId) {
    return null;
  }

  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, input.organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, "crowdin"),
        eq(
          schema.organizationExternalTmsProviderCredentials.id,
          project.externalProviderCredentialId,
        ),
      ),
    )
    .limit(1);

  if (!credential) {
    return null;
  }

  return {
    externalProjectId: project.externalProjectId,
    credential,
  };
}

export function decryptCrowdinCredentialToken(
  credential: CrowdinProjectCredential["credential"],
): string {
  return unwrapProviderCredentialCrypto(
    decryptProviderCredential({
      algorithm: credential.encryptionAlgorithm,
      keyVersion: credential.keyVersion,
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.authTag,
    }),
  );
}
