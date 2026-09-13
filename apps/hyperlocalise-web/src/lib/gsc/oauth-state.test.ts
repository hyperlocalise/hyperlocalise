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
import { describe, expect, it } from "vite-plus/test";

import { createGscOAuthState, verifyGscOAuthState } from "./oauth-state";

const secret = "test-gsc-oauth-state-secret";

describe("gsc oauth state", () => {
  it("round-trips a signed return path", async () => {
    const state = await createGscOAuthState({
      organizationSlug: "acme",
      returnTo: "/org/acme/domains/ld_1/search-console?locale=france-fr",
      nonce: "nonce-1",
      secret,
    });

    await expect(verifyGscOAuthState(state, secret)).resolves.toEqual({
      organizationSlug: "acme",
      returnTo: "/org/acme/domains/ld_1/search-console?locale=france-fr",
      nonce: "nonce-1",
    });
  });

  it("rejects a tampered signature", async () => {
    const state = await createGscOAuthState({
      organizationSlug: "acme",
      returnTo: "/org/acme/domains",
      nonce: "nonce-2",
      secret,
    });

    await expect(verifyGscOAuthState(`${state}x`, secret)).resolves.toBeNull();
  });
});
