import { and, eq, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import {
  encryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import {
  decryptCrowdinOAuthTokenBundle,
  isCrowdinOAuthAccessTokenFresh,
  refreshCrowdinOAuthToken,
  type CrowdinOAuthTokenBundle,
} from "@/lib/providers/organization-external-tms-provider-credentials";

export type CrowdinUserConnectionSummary = {
  id: string;
  crowdinUserId: number;
  username: string;
  email: string | null;
  fullName: string | null;
  oauthExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CrowdinUserConnection = typeof schema.crowdinUserConnections.$inferSelect;

export type CrowdinUserConnectionUpsertError = { code: "crowdin_user_already_linked" };

function isUniqueViolation(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  if ("code" in error && error.code === "23505") {
    return true;
  }

  const cause = "cause" in error ? error.cause : undefined;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}

function summarizeCrowdinUserConnection(
  connection: CrowdinUserConnection,
): CrowdinUserConnectionSummary {
  return {
    id: connection.id,
    crowdinUserId: connection.crowdinUserId,
    username: connection.username,
    email: connection.email,
    fullName: connection.fullName,
    oauthExpiresAt: connection.oauthExpiresAt?.toISOString() ?? null,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

export async function getCrowdinUserConnection(input: {
  organizationId: string;
  userId: string;
}): Promise<CrowdinUserConnection | null> {
  const [connection] = await db
    .select()
    .from(schema.crowdinUserConnections)
    .where(
      and(
        eq(schema.crowdinUserConnections.organizationId, input.organizationId),
        eq(schema.crowdinUserConnections.userId, input.userId),
      ),
    )
    .limit(1);

  return connection ?? null;
}

export async function getCrowdinUserConnectionSummary(input: {
  organizationId: string;
  userId: string;
}): Promise<CrowdinUserConnectionSummary | null> {
  const connection = await getCrowdinUserConnection(input);
  return connection ? summarizeCrowdinUserConnection(connection) : null;
}

async function findCrowdinUserConnectionOwnerByCrowdinUserId(input: {
  organizationId: string;
  crowdinUserId: number;
}) {
  const [connection] = await db
    .select({ userId: schema.crowdinUserConnections.userId })
    .from(schema.crowdinUserConnections)
    .where(
      and(
        eq(schema.crowdinUserConnections.organizationId, input.organizationId),
        eq(schema.crowdinUserConnections.crowdinUserId, input.crowdinUserId),
      ),
    )
    .limit(1);

  return connection ?? null;
}

export async function upsertCrowdinUserConnection(input: {
  organizationId: string;
  userId: string;
  providerCredentialId: string;
  tokenBundle: CrowdinOAuthTokenBundle;
  crowdinUser: {
    id: number;
    username: string;
    email?: string | null;
    fullName?: string | null;
  };
}): Promise<Result<CrowdinUserConnectionSummary, CrowdinUserConnectionUpsertError>> {
  const existingByCrowdinUserId = await findCrowdinUserConnectionOwnerByCrowdinUserId({
    organizationId: input.organizationId,
    crowdinUserId: input.crowdinUser.id,
  });
  if (existingByCrowdinUserId && existingByCrowdinUserId.userId !== input.userId) {
    return err({ code: "crowdin_user_already_linked" });
  }

  const encrypted = unwrapProviderCredentialCrypto(
    encryptProviderCredential(JSON.stringify(input.tokenBundle)),
  );
  const now = new Date();

  try {
    const [connection] = await db
      .insert(schema.crowdinUserConnections)
      .values({
        organizationId: input.organizationId,
        userId: input.userId,
        providerCredentialId: input.providerCredentialId,
        crowdinUserId: input.crowdinUser.id,
        username: input.crowdinUser.username,
        email: input.crowdinUser.email ?? null,
        fullName: input.crowdinUser.fullName ?? null,
        oauthExpiresAt: new Date(input.tokenBundle.expiresAt),
        encryptionAlgorithm: encrypted.algorithm,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion,
      })
      .onConflictDoUpdate({
        target: [
          schema.crowdinUserConnections.organizationId,
          schema.crowdinUserConnections.userId,
        ],
        set: {
          providerCredentialId: input.providerCredentialId,
          crowdinUserId: input.crowdinUser.id,
          username: input.crowdinUser.username,
          email: input.crowdinUser.email ?? null,
          fullName: input.crowdinUser.fullName ?? null,
          oauthExpiresAt: new Date(input.tokenBundle.expiresAt),
          encryptionAlgorithm: encrypted.algorithm,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
          updatedAt: now,
        },
      })
      .returning();

    return ok(summarizeCrowdinUserConnection(connection));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return err({ code: "crowdin_user_already_linked" });
    }

    throw error;
  }
}

export async function resolveCrowdinUserConnectionSecretMaterial(input: {
  connection: CrowdinUserConnection;
  fetchFn?: typeof fetch;
}) {
  const tokenBundle = decryptCrowdinOAuthTokenBundle(input.connection);
  if (isCrowdinOAuthAccessTokenFresh(tokenBundle)) {
    return tokenBundle.accessToken;
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${[
        "crowdin_user_oauth_refresh",
        input.connection.id,
      ].join(":")}, 0))`,
    );

    const [freshConnection] = await tx
      .select()
      .from(schema.crowdinUserConnections)
      .where(eq(schema.crowdinUserConnections.id, input.connection.id))
      .limit(1);

    if (!freshConnection) {
      throw new Error("crowdin_user_connection_not_found");
    }

    const lockedTokenBundle = decryptCrowdinOAuthTokenBundle(freshConnection);
    if (isCrowdinOAuthAccessTokenFresh(lockedTokenBundle)) {
      return lockedTokenBundle.accessToken;
    }

    const refreshed = await refreshCrowdinOAuthToken({
      tokenBundle: lockedTokenBundle,
      fetchFn: input.fetchFn,
    });
    const encrypted = unwrapProviderCredentialCrypto(
      encryptProviderCredential(JSON.stringify(refreshed)),
    );

    await tx
      .update(schema.crowdinUserConnections)
      .set({
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptionAlgorithm: encrypted.algorithm,
        keyVersion: encrypted.keyVersion,
        oauthExpiresAt: new Date(refreshed.expiresAt),
        updatedAt: new Date(),
      })
      .where(eq(schema.crowdinUserConnections.id, input.connection.id));

    return refreshed.accessToken;
  });
}
