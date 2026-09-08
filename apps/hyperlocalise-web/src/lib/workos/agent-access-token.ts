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
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

import { defaultApiKeyPermissions } from "@/api/routes/api-key/api-key.schema";
import { env } from "@/lib/env";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import { getWorkosAuthkitIssuerUrl } from "@/lib/workos/config";

export const MCP_AGENT_SCOPE = "mcp";

export const AGENT_ACCESS_SCOPES = [...defaultApiKeyPermissions, MCP_AGENT_SCOPE] as const;

export const PUBLIC_API_PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource/api/v1";

export type AgentAccessTokenClaims = {
  registrationId: string;
  workosUserId: string;
  workosOrganizationId: string;
  scopes: string[];
};

export type AgentAccessTokenError = { code: "invalid_agent_access_token" };

type PublicKeyResolver = (kid: string) => Promise<string>;

const JWKS_CACHE_MS = 10 * 60 * 1000;

const jwksClients = new Map<string, ReturnType<typeof jwksClient>>();
let publicKeyResolverForTest: PublicKeyResolver | null = null;

export function isCompactJwt(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

export function setAgentAccessTokenPublicKeyResolverForTest(resolver: PublicKeyResolver | null) {
  publicKeyResolverForTest = resolver;
}

export function getPublicApiProtectedResourceMetadata(origin: string) {
  const authorizationServer = getWorkosAuthkitIssuerUrl();

  return {
    resource: `${origin}/api/v1`,
    authorization_servers: authorizationServer ? [authorizationServer] : [],
    scopes_supported: [...AGENT_ACCESS_SCOPES],
    bearer_methods_supported: ["header"],
  };
}

export function publicApiWwwAuthenticate(requestUrl: string): string {
  const resourceMetadataUrl = new URL(PUBLIC_API_PROTECTED_RESOURCE_PATH, requestUrl);
  return `Bearer resource_metadata="${resourceMetadataUrl.toString()}"`;
}

function parseAudiences(): string[] {
  const audiences = new Set<string>();
  if (env.WORKOS_CLIENT_ID) {
    audiences.add(env.WORKOS_CLIENT_ID);
  }

  const publicAppUrl = env.HYPERLOCALISE_PUBLIC_APP_URL;
  if (publicAppUrl) {
    audiences.add(new URL("/api/v1", publicAppUrl).toString().replace(/\/$/, ""));
    audiences.add(new URL("/mcp", publicAppUrl).toString().replace(/\/$/, ""));
  }

  return [...audiences];
}

function parseScope(scope: unknown): string[] {
  if (typeof scope !== "string") {
    return [];
  }

  return scope
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseActSubject(act: unknown): string | null {
  if (!act || typeof act !== "object" || !("sub" in act)) {
    return null;
  }

  return typeof act.sub === "string" && act.sub.length > 0 ? act.sub : null;
}

function getJwksClientForIssuer(issuer: string) {
  let client = jwksClients.get(issuer);
  if (!client) {
    client = jwksClient({
      jwksUri: `${issuer}/.well-known/jwks.json`,
      cache: true,
      cacheMaxAge: JWKS_CACHE_MS,
      rateLimit: true,
    });
    jwksClients.set(issuer, client);
  }
  return client;
}

async function resolvePublicKey(kid: string, issuer: string): Promise<string> {
  if (publicKeyResolverForTest) {
    return publicKeyResolverForTest(kid);
  }

  const signingKey = await getJwksClientForIssuer(issuer).getSigningKey(kid);
  return signingKey.getPublicKey();
}

export async function verifyWorkosAgentAccessToken(
  token: string,
): Promise<Result<AgentAccessTokenClaims, AgentAccessTokenError>> {
  const issuer = getWorkosAuthkitIssuerUrl();
  const audiences = parseAudiences();

  if (!issuer || audiences.length === 0 || !isCompactJwt(token)) {
    return err({ code: "invalid_agent_access_token" });
  }

  try {
    const decodedHeader = jwt.decode(token, { complete: true });
    const keyId = decodedHeader?.header.kid;
    if (!keyId) {
      return err({ code: "invalid_agent_access_token" });
    }

    const publicKey = await resolvePublicKey(keyId, issuer);
    const payload = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      issuer,
      audience: audiences,
    });

    if (typeof payload !== "object" || payload === null) {
      return err({ code: "invalid_agent_access_token" });
    }

    const registrationId = typeof payload.sub === "string" ? payload.sub : null;
    const workosOrganizationId = typeof payload.org_id === "string" ? payload.org_id : null;
    const workosUserId = parseActSubject(payload.act);
    const scopes = parseScope(payload.scope);

    if (!registrationId || !workosOrganizationId || !workosUserId) {
      return err({ code: "invalid_agent_access_token" });
    }

    return ok({
      registrationId,
      workosUserId,
      workosOrganizationId,
      scopes,
    });
  } catch {
    return err({ code: "invalid_agent_access_token" });
  }
}
