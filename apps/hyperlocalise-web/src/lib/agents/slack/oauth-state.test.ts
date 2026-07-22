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
import "dotenv/config";

import { describe, expect, it } from "vite-plus/test";

import { createSlackState, verifySlackState } from "./oauth-state";

const secret = "test-slack-oauth-state-secret";

describe("slack oauth state", () => {
  it("round trips slugs containing colons", async () => {
    const state = await createSlackState("org:with:colon", secret, "nonce-123");

    await expect(verifySlackState(state, secret)).resolves.toEqual(
      expect.objectContaining({ slug: "org:with:colon", nonce: "nonce-123" }),
    );
  });
});
