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
