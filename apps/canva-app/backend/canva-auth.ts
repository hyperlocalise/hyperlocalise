import { createHash } from "node:crypto";

import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

type VerifiedCanvaUser = {
  userId: string;
  brandId: string;
};

export function createCanvaAuthMiddleware(appId: string | undefined) {
  if (!appId) {
    return (_request: Request, _response: Response, next: NextFunction) => {
      next();
    };
  }

  return async (request: Request, response: Response, next: NextFunction) => {
    const token = getBearerToken(request.header("authorization"));
    if (!token) {
      next();
      return;
    }

    try {
      const verified = await verifyCanvaToken(token, appId);
      request.canvaUser = verified.user;
      next();
    } catch {
      response.status(401).json({
        error: "unauthorized",
        message: "Canva user token is invalid.",
      });
    }
  };
}

function getBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function createJwksClient(appId: string) {
  return jwksClient({
    jwksUri: `https://api.canva.com/rest/v1/apps/${appId}/jwks`,
    cache: true,
    rateLimit: true,
  });
}

async function verifyCanvaToken(token: string, appId: string) {
  const client = createJwksClient(appId);
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

export async function resolveDesignId(
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

declare global {
  namespace Express {
    interface Request {
      canvaUser?: VerifiedCanvaUser;
    }
  }
}
