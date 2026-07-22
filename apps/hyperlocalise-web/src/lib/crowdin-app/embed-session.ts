/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

export const CROWDIN_EMBED_SESSION_COOKIE = "hl_crowdin_embed";
export const CROWDIN_EMBED_SESSION_HEADER = "x-hyperlocalise-crowdin-embed";
export const CROWDIN_EMBED_SESSION_TOKEN_PREFIX = "hlce_";
const EMBED_SESSION_TTL_SECONDS = 60 * 60;

export type CrowdinEmbedSessionPayload = {
  v: 1;
  hlUserId: string;
  hlOrganizationId: string;
  hlOrganizationSlug: string;
  hlProjectId: string;
  crowdinUserId: number;
  crowdinOrganizationId: number;
  crowdinProjectId: number;
  exp: number;
};

function getEmbedSessionSecret() {
  const secret = env.CROWDIN_APP_EMBED_SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("crowdin_embed_session_secret_missing");
  }
  return secret;
}

function encodePayload(payload: CrowdinEmbedSessionPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function sign(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function mintCrowdinEmbedSessionToken(
  input: Omit<CrowdinEmbedSessionPayload, "v" | "exp"> & { expiresInSeconds?: number },
): string {
  const secret = getEmbedSessionSecret();

  const payload: CrowdinEmbedSessionPayload = {
    v: 1,
    hlUserId: input.hlUserId,
    hlOrganizationId: input.hlOrganizationId,
    hlOrganizationSlug: input.hlOrganizationSlug,
    hlProjectId: input.hlProjectId,
    crowdinUserId: input.crowdinUserId,
    crowdinOrganizationId: input.crowdinOrganizationId,
    crowdinProjectId: input.crowdinProjectId,
    exp: Math.floor(Date.now() / 1000) + (input.expiresInSeconds ?? EMBED_SESSION_TTL_SECONDS),
  };

  const encodedPayload = encodePayload(payload);
  return `${CROWDIN_EMBED_SESSION_TOKEN_PREFIX}${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function verifyCrowdinEmbedSessionToken(
  token: string,
): CrowdinEmbedSessionPayload | { error: string } {
  let secret: string;
  try {
    secret = getEmbedSessionSecret();
  } catch {
    return { error: "crowdin_embed_session_secret_missing" };
  }

  const raw = token.startsWith(CROWDIN_EMBED_SESSION_TOKEN_PREFIX)
    ? token.slice(CROWDIN_EMBED_SESSION_TOKEN_PREFIX.length)
    : token;
  const [encodedPayload, signature] = raw.split(".");
  if (!encodedPayload || !signature) {
    return { error: "crowdin_embed_session_invalid" };
  }

  const expected = sign(encodedPayload, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { error: "crowdin_embed_session_invalid" };
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as CrowdinEmbedSessionPayload;
    if (payload.v !== 1 || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return { error: "crowdin_embed_session_expired" };
    }
    if (
      !payload.hlUserId ||
      !payload.hlOrganizationId ||
      !payload.hlOrganizationSlug ||
      !payload.hlProjectId
    ) {
      return { error: "crowdin_embed_session_invalid" };
    }
    return payload;
  } catch {
    return { error: "crowdin_embed_session_invalid" };
  }
}

export function parseCrowdinEmbedSessionFromCookie(cookieHeader: string | undefined) {
  if (!cookieHeader) {
    return null;
  }

  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CROWDIN_EMBED_SESSION_COOKIE}=`))
    ?.slice(`${CROWDIN_EMBED_SESSION_COOKIE}=`.length);

  return token || null;
}

export function buildCrowdinEmbedSessionCookie(token: string): string {
  // SameSite=None requires Secure; browsers reject the pair otherwise.
  return [
    `${CROWDIN_EMBED_SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=None",
    "Secure",
    `Max-Age=${EMBED_SESSION_TTL_SECONDS}`,
  ].join("; ");
}
