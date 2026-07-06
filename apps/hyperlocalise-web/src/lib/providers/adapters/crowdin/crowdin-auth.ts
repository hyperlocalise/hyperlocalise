import { and, eq, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { createLogger } from "@/lib/log";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import {
  OAUTH_AUTH_MODE,
  PAT_AUTH_MODE,
} from "@/lib/providers/contracts/external-tms-provider-credential";
import {
  decryptCrowdinOAuthTokenBundle,
  getActiveOrganizationExternalTmsProviderCredentialRow,
  isCrowdinOAuthAccessTokenFresh,
  refreshCrowdinOAuthToken,
  type CrowdinOAuthTokenBundle,
} from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

const logger = createLogger("crowdin-auth");

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

export type CrowdinProjectCredential = {
  externalProjectId: string;
  credential: typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
};

export class CrowdinAuth {
  private readAuthMode(connection: CrowdinUserConnection) {
    return connection.authMode === PAT_AUTH_MODE ? PAT_AUTH_MODE : OAUTH_AUTH_MODE;
  }

  private isUniqueViolation(error: unknown) {
    if (!(error instanceof Error)) {
      return false;
    }

    if ("code" in error && error.code === "23505") {
      return true;
    }

    const cause = "cause" in error ? error.cause : undefined;
    return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
  }

  private summarizeConnection(connection: CrowdinUserConnection): CrowdinUserConnectionSummary {
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

  private decryptPat(connection: CrowdinUserConnection) {
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

  private async findConnectionOwnerByCrowdinUserId(input: {
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

  async getUserConnection(input: {
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

  async getUserConnectionSummary(input: {
    organizationId: string;
    userId: string;
  }): Promise<CrowdinUserConnectionSummary | null> {
    const connection = await this.getUserConnection(input);
    return connection ? this.summarizeConnection(connection) : null;
  }

  async upsertUserConnection(input: {
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
    const existingByCrowdinUserId = await this.findConnectionOwnerByCrowdinUserId({
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

      return ok(this.summarizeConnection(connection));
    } catch (error) {
      if (this.isUniqueViolation(error)) {
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

  async upsertUserPatConnection(input: {
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
    const existingByCrowdinUserId = await this.findConnectionOwnerByCrowdinUserId({
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

      return ok(this.summarizeConnection(connection));
    } catch (error) {
      if (this.isUniqueViolation(error)) {
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

  async resolveUserConnectionSecretMaterial(input: {
    connection: CrowdinUserConnection;
    authMode: string;
    fetchFn?: typeof fetch;
  }) {
    const connectionAuthMode = this.readAuthMode(input.connection);

    if (connectionAuthMode !== input.authMode) {
      await db
        .delete(schema.crowdinUserConnections)
        .where(eq(schema.crowdinUserConnections.id, input.connection.id));
      throw new Error("crowdin_user_connection_auth_mode_mismatch");
    }

    if (connectionAuthMode === PAT_AUTH_MODE) {
      return this.decryptPat(input.connection);
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

  async loadProjectCredential(input: {
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
            eq(schema.organizationExternalTmsProviderCredentials.providerKind, "crowdin"),
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
    if (encodedProject?.providerKind !== "crowdin") {
      return null;
    }

    const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(
      input.organizationId,
    );
    if (!credential || credential.providerKind !== "crowdin") {
      return null;
    }

    return {
      externalProjectId: encodedProject.externalProjectId,
      credential,
    };
  }
}

export const crowdinAuth = new CrowdinAuth();
