import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import {
  decryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

export async function loadContentfulConnectionWithToken(input: {
  organizationId: string;
  connectionId: string;
}) {
  const [connection] = await db
    .select()
    .from(schema.contentfulConnections)
    .where(
      and(
        eq(schema.contentfulConnections.organizationId, input.organizationId),
        eq(schema.contentfulConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  if (!connection) {
    return null;
  }

  const token = unwrapProviderCredentialCrypto(
    decryptProviderCredential({
      algorithm: connection.encryptionAlgorithm,
      keyVersion: connection.keyVersion,
      ciphertext: connection.ciphertext,
      iv: connection.iv,
      authTag: connection.authTag,
    }),
  );

  return { connection, token };
}
