import { and, eq, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { createLogger } from "@/lib/log";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import {
  decryptLokaliseOAuthTokenBundle,
  formatLokaliseOAuthAuthorizationSecret,
  getActiveOrganizationExternalTmsProviderCredentialRow,
  isLokaliseOAuthAccessTokenFresh,
  refreshLokaliseOAuthToken,
  type LokaliseOAuthTokenBundle,
} from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
import {
  encryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

const logger = createLogger("lokalise-auth");

export type LokaliseUserConnectionSummary = {
  id: string;
  lokaliseUserId: number;
  username: string;
  email: string | null;
  fullName: string | null;
  oauthExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type LokaliseUserConnection = typeof schema.lokaliseUserConnections.$inferSelect;

export type LokaliseUserConnectionUpsertError = { code: "lokalise_user_already_linked" };

export type LokaliseProjectCredential = {
  externalProjectId: string;
  credential: typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
};

export class LokaliseAuth {
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

  private summarizeConnection(connection: LokaliseUserConnection): LokaliseUserConnectionSummary {
    return {
      id: connection.id,
      lokaliseUserId: connection.lokaliseUserId,
      username: connection.username,
      email: connection.email,
      fullName: connection.fullName,
      oauthExpiresAt: connection.oauthExpiresAt?.toISOString() ?? null,
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString(),
    };
  }

  private async findConnectionOwnerByLokaliseUserId(input: {
    organizationId: string;
    lokaliseUserId: number;
  }) {
    const [connection] = await db
      .select({ userId: schema.lokaliseUserConnections.userId })
      .from(schema.lokaliseUserConnections)
      .where(
        and(
          eq(schema.lokaliseUserConnections.organizationId, input.organizationId),
          eq(schema.lokaliseUserConnections.lokaliseUserId, input.lokaliseUserId),
        ),
      )
      .limit(1);

    return connection ?? null;
  }

  async getUserConnection(input: {
    organizationId: string;
    userId: string;
  }): Promise<LokaliseUserConnection | null> {
    const [connection] = await db
      .select()
      .from(schema.lokaliseUserConnections)
      .where(
        and(
          eq(schema.lokaliseUserConnections.organizationId, input.organizationId),
          eq(schema.lokaliseUserConnections.userId, input.userId),
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
      "lokalise user connection lookup completed",
    );

    return connection ?? null;
  }

  async getUserConnectionSummary(input: {
    organizationId: string;
    userId: string;
  }): Promise<LokaliseUserConnectionSummary | null> {
    const connection = await this.getUserConnection(input);
    return connection ? this.summarizeConnection(connection) : null;
  }

  async upsertUserConnection(input: {
    organizationId: string;
    userId: string;
    providerCredentialId: string;
    tokenBundle: LokaliseOAuthTokenBundle;
    lokaliseUser: {
      id: number;
      username: string;
      email?: string | null;
      fullName?: string | null;
    };
  }): Promise<Result<LokaliseUserConnectionSummary, LokaliseUserConnectionUpsertError>> {
    const existingByLokaliseUserId = await this.findConnectionOwnerByLokaliseUserId({
      organizationId: input.organizationId,
      lokaliseUserId: input.lokaliseUser.id,
    });
    if (existingByLokaliseUserId && existingByLokaliseUserId.userId !== input.userId) {
      logger.warn(
        {
          organizationId: input.organizationId,
          userId: input.userId,
          existingUserId: existingByLokaliseUserId.userId,
          providerCredentialId: input.providerCredentialId,
          lokaliseUserId: input.lokaliseUser.id,
        },
        "lokalise user connection upsert rejected: lokalise user already linked",
      );
      return err({ code: "lokalise_user_already_linked" });
    }

    const encrypted = unwrapProviderCredentialCrypto(
      encryptProviderCredential(JSON.stringify(input.tokenBundle)),
    );
    const now = new Date();

    try {
      const [connection] = await db
        .insert(schema.lokaliseUserConnections)
        .values({
          organizationId: input.organizationId,
          userId: input.userId,
          providerCredentialId: input.providerCredentialId,
          lokaliseUserId: input.lokaliseUser.id,
          username: input.lokaliseUser.username,
          email: input.lokaliseUser.email ?? null,
          fullName: input.lokaliseUser.fullName ?? null,
          oauthExpiresAt: new Date(input.tokenBundle.expiresAt),
          encryptionAlgorithm: encrypted.algorithm,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
        })
        .onConflictDoUpdate({
          target: [
            schema.lokaliseUserConnections.organizationId,
            schema.lokaliseUserConnections.userId,
          ],
          set: {
            providerCredentialId: input.providerCredentialId,
            lokaliseUserId: input.lokaliseUser.id,
            username: input.lokaliseUser.username,
            email: input.lokaliseUser.email ?? null,
            fullName: input.lokaliseUser.fullName ?? null,
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
          lokaliseUserId: input.lokaliseUser.id,
        },
        "lokalise user connection upsert completed",
      );

      return ok(this.summarizeConnection(connection));
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        logger.warn(
          {
            organizationId: input.organizationId,
            userId: input.userId,
            providerCredentialId: input.providerCredentialId,
            lokaliseUserId: input.lokaliseUser.id,
          },
          "lokalise user connection upsert rejected: unique violation",
        );
        return err({ code: "lokalise_user_already_linked" });
      }

      throw error;
    }
  }

  async resolveUserConnectionSecretMaterial(input: {
    connection: LokaliseUserConnection;
    fetchFn?: typeof fetch;
  }) {
    const tokenBundle = decryptLokaliseOAuthTokenBundle(input.connection);
    if (isLokaliseOAuthAccessTokenFresh(tokenBundle)) {
      return formatLokaliseOAuthAuthorizationSecret(tokenBundle);
    }

    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${[
          "lokalise_user_oauth_refresh",
          input.connection.id,
        ].join(":")}, 0))`,
      );

      const [freshConnection] = await tx
        .select()
        .from(schema.lokaliseUserConnections)
        .where(eq(schema.lokaliseUserConnections.id, input.connection.id))
        .limit(1);

      if (!freshConnection) {
        throw new Error("lokalise_user_connection_not_found");
      }

      const lockedTokenBundle = decryptLokaliseOAuthTokenBundle(freshConnection);
      if (isLokaliseOAuthAccessTokenFresh(lockedTokenBundle)) {
        return formatLokaliseOAuthAuthorizationSecret(lockedTokenBundle);
      }

      const refreshed = await refreshLokaliseOAuthToken({
        tokenBundle: lockedTokenBundle,
        fetchFn: input.fetchFn,
      });
      const encrypted = unwrapProviderCredentialCrypto(
        encryptProviderCredential(JSON.stringify(refreshed)),
      );

      await tx
        .update(schema.lokaliseUserConnections)
        .set({
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          encryptionAlgorithm: encrypted.algorithm,
          keyVersion: encrypted.keyVersion,
          oauthExpiresAt: new Date(refreshed.expiresAt),
          updatedAt: new Date(),
        })
        .where(eq(schema.lokaliseUserConnections.id, input.connection.id));

      return formatLokaliseOAuthAuthorizationSecret(refreshed);
    });
  }

  async loadProjectCredential(input: {
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
}

export const lokaliseAuth = new LokaliseAuth();
