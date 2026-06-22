import { createHash } from "node:crypto";

import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

import type { CanvaVerifiedUser } from "./types";

const jwksClients = new Map<string, ReturnType<typeof jwksClient>>();

function getJwksClient(appId: string) {
  let client = jwksClients.get(appId);
  if (!client) {
    client = jwksClient({
      jwksUri: `https://api.canva.com/rest/v1/apps/${appId}/jwks`,
      cache: true,
      rateLimit: true,
    });
    jwksClients.set(appId, client);
  }
  return client;
}

async function verifyCanvaToken(token: string, appId: string) {
  const client = getJwksClient(appId);
  const decodedHeader = jwt.decode(token, { complete: true });
  const keyId = decodedHeader?.header.kid;
  if (!keyId) {
    throw new Error("missing_key_id");
  }

  const signingKey = await client.getSigningKey(keyId);
  const publicKey = signingKey.getPublicKey();
  const verified = jwt.verify(token, publicKey, {
    audience: appId,
  }) as jwt.JwtPayload;

  return {
    user: {
      userId: String(verified.userId ?? ""),
      brandId: String(verified.brandId ?? ""),
    },
    designId: typeof verified.designId === "string" ? verified.designId : undefined,
  };
}

export async function verifyCanvaUserToken(
  token: string,
  appId: string,
): Promise<CanvaVerifiedUser> {
  const verified = await verifyCanvaToken(token, appId);
  return verified.user;
}

export async function resolveCanvaDesignId(
  designToken: string,
  appId: string | undefined,
): Promise<string> {
  if (!appId) {
    return createHash("sha256").update(designToken).digest("hex").slice(0, 24);
  }

  const verified = await verifyCanvaToken(designToken, appId);
  if (verified.designId) {
    return verified.designId;
  }

  return createHash("sha256").update(designToken).digest("hex").slice(0, 24);
}
