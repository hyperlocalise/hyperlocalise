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

import { createGitlabState, GITLAB_STATE_TTL_MS, verifyGitlabState } from "./oauth-state";

describe("gitlab oauth state", () => {
  it("round-trips a signed state payload", async () => {
    const secret = "test-gitlab-oauth-state-secret";
    const timestamp = Date.now();
    const state = await createGitlabState("acme-org", secret, "nonce-1", timestamp);
    const verified = await verifyGitlabState(state, secret);

    expect(verified).toEqual({
      slug: "acme-org",
      timestamp,
      nonce: "nonce-1",
    });
  });

  it("rejects tampered signatures", async () => {
    const secret = "test-gitlab-oauth-state-secret";
    const state = await createGitlabState("acme-org", secret, "nonce-1", Date.now());
    const tampered = `${state.slice(0, -1)}x`;

    await expect(verifyGitlabState(tampered, secret)).resolves.toBeNull();
  });

  it("rejects expired state", async () => {
    const secret = "test-gitlab-oauth-state-secret";
    const timestamp = Date.now() - GITLAB_STATE_TTL_MS - 1;
    const state = await createGitlabState("acme-org", secret, "nonce-1", timestamp);

    await expect(verifyGitlabState(state, secret)).resolves.toBeNull();
  });

  it("supports slugs that need URI encoding", async () => {
    const secret = "test-gitlab-oauth-state-secret";
    const state = await createGitlabState("acme/org", secret, "nonce-1", Date.now());
    const verified = await verifyGitlabState(state, secret);

    expect(verified?.slug).toBe("acme/org");
  });
});
