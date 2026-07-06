import { and, eq, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import {
  encryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import {
  decryptPhraseOAuthTokenBundle,
  formatPhraseOAuthAuthorizationSecret,
  isPhraseOAuthAccessTokenFresh,
  refreshPhraseOAuthToken,
  type PhraseOAuthTokenBundle,
} from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import { createLogger } from "@/lib/log";

const logger = createLogger("phrase-auth");

export type PhraseUserConnectionSummary = {
  id: string;
  phraseUserUid: string;
  username: string;
  email: string | null;
  fullName: string | null;
  oauthExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PhraseUserConnection = typeof schema.phraseUserConnections.$inferSelect;

export type PhraseUserConnectionUpsertError = { code: "phrase_user_already_linked" };

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

function summarizePhraseUserConnection(
  connection: PhraseUserConnection,
): PhraseUserConnectionSummary {
  return {
    id: connection.id,
    phraseUserUid: connection.phraseUserUid,
    username: connection.username,
    email: connection.email,
    fullName: connection.fullName,
    oauthExpiresAt: connection.oauthExpiresAt?.toISOString() ?? null,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

export async function getPhraseUserConnection(input: {
  organizationId: string;
  userId: string;
}): Promise<PhraseUserConnection | null> {
  const [connection] = await db
    .select()
    .from(schema.phraseUserConnections)
    .where(
      and(
        eq(schema.phraseUserConnections.organizationId, input.organizationId),
        eq(schema.phraseUserConnections.userId, input.userId),
      ),
    )
    .limit(1);

  logger.info(
    {
      organizationId: input.organizationId,
      userId: input.userId,
      connectionId: connection?.id ?? null,
      providerCredentialId: connection?.providerCredentialId ?? null,
      found: Boolean(connection),
    },
    "phrase user connection lookup completed",
  );

  return connection ?? null;
}

export async function getPhraseUserConnectionSummary(input: {
  organizationId: string;
  userId: string;
}): Promise<PhraseUserConnectionSummary | null> {
  const connection = await getPhraseUserConnection(input);
  return connection ? summarizePhraseUserConnection(connection) : null;
}

async function findPhraseUserConnectionOwnerByPhraseUserUid(input: {
  organizationId: string;
  phraseUserUid: string;
}) {
  const [connection] = await db
    .select({ userId: schema.phraseUserConnections.userId })
    .from(schema.phraseUserConnections)
    .where(
      and(
        eq(schema.phraseUserConnections.organizationId, input.organizationId),
        eq(schema.phraseUserConnections.phraseUserUid, input.phraseUserUid),
      ),
    )
    .limit(1);

  return connection ?? null;
}

export async function upsertPhraseUserConnection(input: {
  organizationId: string;
  userId: string;
  providerCredentialId: string;
  tokenBundle: PhraseOAuthTokenBundle;
  phraseUser: {
    uid: string;
    username: string;
    email?: string | null;
    fullName?: string | null;
  };
}): Promise<Result<PhraseUserConnectionSummary, PhraseUserConnectionUpsertError>> {
  const existingByPhraseUserUid = await findPhraseUserConnectionOwnerByPhraseUserUid({
    organizationId: input.organizationId,
    phraseUserUid: input.phraseUser.uid,
  });
  if (existingByPhraseUserUid && existingByPhraseUserUid.userId !== input.userId) {
    logger.warn(
      {
        organizationId: input.organizationId,
        userId: input.userId,
        existingUserId: existingByPhraseUserUid.userId,
        providerCredentialId: input.providerCredentialId,
        phraseUserUid: input.phraseUser.uid,
      },
      "phrase user connection upsert rejected: phrase user already linked",
    );
    return err({ code: "phrase_user_already_linked" });
  }

  const encrypted = unwrapProviderCredentialCrypto(
    encryptProviderCredential(JSON.stringify(input.tokenBundle)),
  );
  const now = new Date();

  try {
    const [connection] = await db
      .insert(schema.phraseUserConnections)
      .values({
        organizationId: input.organizationId,
        userId: input.userId,
        providerCredentialId: input.providerCredentialId,
        phraseUserUid: input.phraseUser.uid,
        username: input.phraseUser.username,
        email: input.phraseUser.email ?? null,
        fullName: input.phraseUser.fullName ?? null,
        oauthExpiresAt: new Date(input.tokenBundle.expiresAt),
        encryptionAlgorithm: encrypted.algorithm,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion,
      })
      .onConflictDoUpdate({
        target: [schema.phraseUserConnections.organizationId, schema.phraseUserConnections.userId],
        set: {
          providerCredentialId: input.providerCredentialId,
          phraseUserUid: input.phraseUser.uid,
          username: input.phraseUser.username,
          email: input.phraseUser.email ?? null,
          fullName: input.phraseUser.fullName ?? null,
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

    logger.info(
      {
        organizationId: input.organizationId,
        userId: input.userId,
        providerCredentialId: input.providerCredentialId,
        connectionId: connection.id,
        phraseUserUid: input.phraseUser.uid,
      },
      "phrase user connection upsert completed",
    );

    return ok(summarizePhraseUserConnection(connection));
  } catch (error) {
    if (isUniqueViolation(error)) {
      logger.warn(
        {
          organizationId: input.organizationId,
          userId: input.userId,
          providerCredentialId: input.providerCredentialId,
          phraseUserUid: input.phraseUser.uid,
        },
        "phrase user connection upsert rejected: unique violation",
      );
      return err({ code: "phrase_user_already_linked" });
    }

    throw error;
  }
}

export async function resolvePhraseUserConnectionSecretMaterial(input: {
  connection: PhraseUserConnection;
  baseUrl?: string | null;
  fetchFn?: typeof fetch;
}) {
  const tokenBundle = decryptPhraseOAuthTokenBundle(input.connection);
  if (isPhraseOAuthAccessTokenFresh(tokenBundle)) {
    return formatPhraseOAuthAuthorizationSecret(tokenBundle);
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${[
        "phrase_user_oauth_refresh",
        input.connection.id,
      ].join(":")}, 0))`,
    );

    const [freshConnection] = await tx
      .select()
      .from(schema.phraseUserConnections)
      .where(eq(schema.phraseUserConnections.id, input.connection.id))
      .limit(1);

    if (!freshConnection) {
      throw new Error("phrase_user_connection_not_found");
    }

    const lockedTokenBundle = decryptPhraseOAuthTokenBundle(freshConnection);
    if (isPhraseOAuthAccessTokenFresh(lockedTokenBundle)) {
      return formatPhraseOAuthAuthorizationSecret(lockedTokenBundle);
    }

    const refreshed = await refreshPhraseOAuthToken({
      tokenBundle: lockedTokenBundle,
      baseUrl: input.baseUrl,
      fetchFn: input.fetchFn,
    });
    const encrypted = unwrapProviderCredentialCrypto(
      encryptProviderCredential(JSON.stringify(refreshed)),
    );

    await tx
      .update(schema.phraseUserConnections)
      .set({
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptionAlgorithm: encrypted.algorithm,
        keyVersion: encrypted.keyVersion,
        oauthExpiresAt: new Date(refreshed.expiresAt),
        updatedAt: new Date(),
      })
      .where(eq(schema.phraseUserConnections.id, input.connection.id));

    return formatPhraseOAuthAuthorizationSecret(refreshed);
  });
}
