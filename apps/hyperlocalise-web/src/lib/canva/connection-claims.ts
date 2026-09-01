/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { randomBytes } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { DEFAULT_APP_LOCALE } from "@/lib/app-i18n/locales";
import { db, schema } from "@/lib/database/client";
import { env } from "@/lib/env";
import { isErr } from "@/lib/primitives/result/results";
import {
  decryptProviderCredential,
  encryptProviderCredential,
} from "@/lib/security/provider-credential-crypto";

import { hashCanvaConnectionToken } from "./connection-token";
import { regenerateCanvaConnectionToken } from "./connections";
import type { CanvaConnectionClaimCreated, CanvaConnectionClaimPollResult } from "./types";

const CLAIM_TTL_MS = 10 * 60 * 1000;
const CLAIM_TOKEN_PREFIX = "hl_canva_claim_";

function generateClaimPollToken() {
  return `${CLAIM_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

function hashClaimPollToken(token: string) {
  return hashCanvaConnectionToken(token);
}

function buildAuthorizeUrl(claimId: string) {
  const appUrl = env.HYPERLOCALISE_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new Error("hyperlocalise_public_app_url_missing");
  }

  const origin = appUrl.replace(/\/+$/, "");
  return `${origin}/${DEFAULT_APP_LOCALE}/connect/canva?claimId=${encodeURIComponent(claimId)}`;
}

export async function createCanvaConnectionClaim(): Promise<CanvaConnectionClaimCreated> {
  const pollToken = generateClaimPollToken();
  const expiresAt = new Date(Date.now() + CLAIM_TTL_MS);

  const [claim] = await db
    .insert(schema.canvaConnectionClaims)
    .values({
      pollTokenHash: hashClaimPollToken(pollToken),
      expiresAt,
    })
    .returning({ id: schema.canvaConnectionClaims.id });

  if (!claim) {
    throw new Error("canva_claim_create_failed");
  }

  return {
    claimId: claim.id,
    pollToken,
    authorizeUrl: buildAuthorizeUrl(claim.id),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function completeCanvaConnectionClaim(input: {
  organizationId: string;
  userId: string;
  connectionId: string;
  claimId: string;
}) {
  // Lock the claim before rotating the connection token. Concurrent
  // complete-claim calls used to regenerate first, then lose the claim
  // update — leaving the sealed claim token mismatched against the
  // connection hash so Canva auth permanently failed for that connect.
  return db.transaction(async (tx) => {
    const [claim] = await tx
      .select()
      .from(schema.canvaConnectionClaims)
      .where(eq(schema.canvaConnectionClaims.id, input.claimId))
      .limit(1)
      .for("update");

    if (!claim) {
      throw new Error("canva_claim_not_found");
    }

    if (claim.consumedAt || claim.expiresAt.getTime() <= Date.now()) {
      throw new Error("canva_claim_expired");
    }

    if (claim.completedAt || claim.ciphertext) {
      throw new Error("canva_claim_already_completed");
    }

    const regenerated = await regenerateCanvaConnectionToken({
      organizationId: input.organizationId,
      userId: input.userId,
      connectionId: input.connectionId,
      database: tx,
    });
    if (!regenerated) {
      throw new Error("canva_connection_not_found");
    }

    const encrypted = encryptProviderCredential(regenerated.connectionToken);
    if (isErr(encrypted)) {
      throw new Error(encrypted.error.code);
    }

    const [updated] = await tx
      .update(schema.canvaConnectionClaims)
      .set({
        organizationId: input.organizationId,
        connectionId: input.connectionId,
        completedAt: new Date(),
        encryptionAlgorithm: encrypted.value.algorithm,
        ciphertext: encrypted.value.ciphertext,
        iv: encrypted.value.iv,
        authTag: encrypted.value.authTag,
        keyVersion: encrypted.value.keyVersion,
      })
      .where(
        and(
          eq(schema.canvaConnectionClaims.id, input.claimId),
          isNull(schema.canvaConnectionClaims.completedAt),
          isNull(schema.canvaConnectionClaims.consumedAt),
        ),
      )
      .returning({ id: schema.canvaConnectionClaims.id });

    if (!updated) {
      throw new Error("canva_claim_already_completed");
    }

    return { claimId: updated.id, connection: regenerated.connection };
  });
}

export async function pollCanvaConnectionClaim(input: {
  claimId: string;
  pollToken: string;
}): Promise<CanvaConnectionClaimPollResult> {
  const [claim] = await db
    .select()
    .from(schema.canvaConnectionClaims)
    .where(
      and(
        eq(schema.canvaConnectionClaims.id, input.claimId),
        eq(schema.canvaConnectionClaims.pollTokenHash, hashClaimPollToken(input.pollToken)),
      ),
    )
    .limit(1);

  if (!claim) {
    throw new Error("canva_claim_not_found");
  }

  if (claim.consumedAt) {
    return { status: "consumed" };
  }

  if (claim.expiresAt.getTime() <= Date.now()) {
    return { status: "expired" };
  }

  if (
    !claim.completedAt ||
    !claim.encryptionAlgorithm ||
    !claim.ciphertext ||
    !claim.iv ||
    !claim.authTag ||
    claim.keyVersion == null
  ) {
    return {
      status: "pending",
      expiresAt: claim.expiresAt.toISOString(),
    };
  }

  const decrypted = decryptProviderCredential({
    algorithm: claim.encryptionAlgorithm,
    keyVersion: claim.keyVersion,
    ciphertext: claim.ciphertext,
    iv: claim.iv,
    authTag: claim.authTag,
  });
  if (isErr(decrypted)) {
    throw new Error(decrypted.error.code);
  }

  const [consumed] = await db
    .update(schema.canvaConnectionClaims)
    .set({
      consumedAt: new Date(),
      encryptionAlgorithm: null,
      ciphertext: null,
      iv: null,
      authTag: null,
      keyVersion: null,
    })
    .where(
      and(
        eq(schema.canvaConnectionClaims.id, input.claimId),
        isNull(schema.canvaConnectionClaims.consumedAt),
      ),
    )
    .returning({ id: schema.canvaConnectionClaims.id });

  if (!consumed) {
    return { status: "consumed" };
  }

  return {
    status: "authorized",
    connectionToken: decrypted.value,
  };
}
