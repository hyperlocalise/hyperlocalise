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
import "dotenv/config";

import { describe, expect, it } from "vite-plus/test";

import { getFigmaRedirectUri, isFigmaRedirectUri } from "./figma-redirect";

describe("figma redirect URI", () => {
  it("uses a fixed AuthKit callback and rejects other hosts", () => {
    const redirectUri = getFigmaRedirectUri();
    expect(redirectUri.endsWith("/auth/figma/callback")).toBe(true);
    expect(isFigmaRedirectUri(redirectUri)).toBe(true);
    expect(isFigmaRedirectUri("https://evil.example/auth/figma/callback")).toBe(false);
  });
});
