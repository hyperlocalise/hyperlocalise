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
