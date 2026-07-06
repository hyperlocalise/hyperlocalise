import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { getActiveOrganizationExternalTmsProviderCredentialRow } from "@/lib/providers/organization-external-tms-provider-credentials";
import { parseProviderProjectId } from "@/lib/providers/tms-provider-resource-id";
import {
  decryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

export type LokaliseProjectCredential = {
  externalProjectId: string;
  credential: typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
};

export async function loadLokaliseProjectCredential(input: {
  organizationId: string;
  projectId: string;
}): Promise<LokaliseProjectCredential | null> {
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
        eq(schema.projects.externalProviderKind, "lokalise"),
        eq(schema.projects.source, "external_tms"),
      ),
    )
    .limit(1);

  if (project?.externalProjectId && project.externalProviderCredentialId) {
    const [credential] = await db
      .select()
      .from(schema.organizationExternalTmsProviderCredentials)
      .where(
        and(
          eq(
            schema.organizationExternalTmsProviderCredentials.organizationId,
            input.organizationId,
          ),
          eq(schema.organizationExternalTmsProviderCredentials.providerKind, "lokalise"),
          eq(
            schema.organizationExternalTmsProviderCredentials.id,
            project.externalProviderCredentialId,
          ),
        ),
      )
      .limit(1);

    if (credential) {
      return {
        externalProjectId: project.externalProjectId,
        credential,
      };
    }
  }

  const encodedProject = parseProviderProjectId(input.projectId);
  if (encodedProject?.providerKind !== "lokalise") {
    return null;
  }

  const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(
    input.organizationId,
  );
  if (!credential || credential.providerKind !== "lokalise") {
    return null;
  }

  return {
    externalProjectId: encodedProject.externalProjectId,
    credential,
  };
}

export function decryptLokaliseCredentialToken(
  credential: LokaliseProjectCredential["credential"],
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
