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
import { createHash } from "node:crypto";

import { describe, expect, it } from "vite-plus/test";

import {
  generateFigmaConnectionToken,
  getFigmaConnectionTokenPrefix,
  hashFigmaConnectionToken,
} from "./connection-token";

describe("figma connection tokens", () => {
  it("mints a prefixed token whose stored prefix and hash match lookups", () => {
    const token = generateFigmaConnectionToken();
    expect(token.startsWith("hl_figma_")).toBe(true);
    expect(getFigmaConnectionTokenPrefix(token)).toBe(token.slice(0, 12));
    expect(hashFigmaConnectionToken(token)).toBe(createHash("sha256").update(token).digest("hex"));
  });
});
