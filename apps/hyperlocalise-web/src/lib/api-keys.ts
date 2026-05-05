import { createHash, randomBytes } from "node:crypto";

const API_KEY_PREFIX = "hl_";

export function generateApiKey(): string {
  const raw = randomBytes(32).toString("base64url");
  return `${API_KEY_PREFIX}${raw}`;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function getApiKeyPrefix(key: string): string {
  return key.slice(0, 8);
}
