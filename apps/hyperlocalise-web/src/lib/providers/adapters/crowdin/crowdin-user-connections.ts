import { and, eq, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import {
  OAUTH_AUTH_MODE,
  PAT_AUTH_MODE,
} from "@/lib/providers/contracts/external-tms-provider-credential";
import {
  decryptCrowdinOAuthTokenBundle,
  isCrowdinOAuthAccessTokenFresh,
  refreshCrowdinOAuthToken,
  type CrowdinOAuthTokenBundle,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import { createLogger } from "@/lib/log";

const logger = createLogger("crowdin-user-connections");

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

function readCrowdinUserConnectionAuthMode(connection: CrowdinUserConnection) {
  return connection.authMode === PAT_AUTH_MODE ? PAT_AUTH_MODE : OAUTH_AUTH_MODE;
}

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

  logger.info(
    {
      organizationId: input.organizationId,
      userId: input.userId,
      connectionId: connection?.id ?? null,
      providerCredentialId: connection?.providerCredentialId ?? null,
      found: Boolean(connection),
    },
    "crowdin user connection lookup completed",
  );

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
    logger.warn(
      {
        organizationId: input.organizationId,
        userId: input.userId,
        existingUserId: existingByCrowdinUserId.userId,
        providerCredentialId: input.providerCredentialId,
        crowdinUserId: input.crowdinUser.id,
      },
      "crowdin user connection upsert rejected: crowdin user already linked",
    );
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
        authMode: OAUTH_AUTH_MODE,
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
          authMode: OAUTH_AUTH_MODE,
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
        crowdinUserId: input.crowdinUser.id,
      },
      "crowdin user connection upsert completed",
    );

    return ok(summarizeCrowdinUserConnection(connection));
  } catch (error) {
    if (isUniqueViolation(error)) {
      logger.warn(
        {
          organizationId: input.organizationId,
          userId: input.userId,
          providerCredentialId: input.providerCredentialId,
          crowdinUserId: input.crowdinUser.id,
        },
        "crowdin user connection upsert rejected: unique violation",
      );
      return err({ code: "crowdin_user_already_linked" });
    }

    throw error;
  }
}

export async function upsertCrowdinUserPatConnection(input: {
  organizationId: string;
  userId: string;
  providerCredentialId: string;
  personalAccessToken: string;
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
    logger.warn(
      {
        organizationId: input.organizationId,
        userId: input.userId,
        existingUserId: existingByCrowdinUserId.userId,
        providerCredentialId: input.providerCredentialId,
        crowdinUserId: input.crowdinUser.id,
      },
      "crowdin user pat connection upsert rejected: crowdin user already linked",
    );
    return err({ code: "crowdin_user_already_linked" });
  }

  const encrypted = unwrapProviderCredentialCrypto(
    encryptProviderCredential(input.personalAccessToken),
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
        authMode: PAT_AUTH_MODE,
        oauthExpiresAt: null,
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
          authMode: PAT_AUTH_MODE,
          oauthExpiresAt: null,
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
        crowdinUserId: input.crowdinUser.id,
      },
      "crowdin user pat connection upsert completed",
    );

    return ok(summarizeCrowdinUserConnection(connection));
  } catch (error) {
    if (isUniqueViolation(error)) {
      logger.warn(
        {
          organizationId: input.organizationId,
          userId: input.userId,
          providerCredentialId: input.providerCredentialId,
          crowdinUserId: input.crowdinUser.id,
        },
        "crowdin user pat connection upsert rejected: unique violation",
      );
      return err({ code: "crowdin_user_already_linked" });
    }

    throw error;
  }
}

function decryptCrowdinUserPat(connection: CrowdinUserConnection) {
  return unwrapProviderCredentialCrypto(
    decryptProviderCredential({
      algorithm: connection.encryptionAlgorithm,
      keyVersion: connection.keyVersion,
      ciphertext: connection.ciphertext,
      iv: connection.iv,
      authTag: connection.authTag,
    }),
  );
}

export async function resolveCrowdinUserConnectionSecretMaterial(input: {
  connection: CrowdinUserConnection;
  authMode: string;
  fetchFn?: typeof fetch;
}) {
  const connectionAuthMode = readCrowdinUserConnectionAuthMode(input.connection);

  if (connectionAuthMode !== input.authMode) {
    await db
      .delete(schema.crowdinUserConnections)
      .where(eq(schema.crowdinUserConnections.id, input.connection.id));
    throw new Error("crowdin_user_connection_auth_mode_mismatch");
  }

  if (connectionAuthMode === PAT_AUTH_MODE) {
    return decryptCrowdinUserPat(input.connection);
  }

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
