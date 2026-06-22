import { createHash, randomBytes } from "node:crypto";

const CONNECTION_TOKEN_PREFIX = "hl_canva_";

export function generateCanvaConnectionToken(): string {
  return `${CONNECTION_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashCanvaConnectionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getCanvaConnectionTokenPrefix(token: string): string {
  return token.slice(0, 12);
}
