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
import { Profanity } from "@2toad/profanity";

const RESERVED_WORKSPACE_IDENTITY_TOKENS = new Set([
  "demo",
  "example",
  "placeholder",
  "sample",
  "test",
  "testing",
]);

const workspaceIdentityProfanity = new Profanity({
  languages: ["en"],
  unicodeWordBoundaries: true,
  wholeWord: true,
});

function normalizeWorkspaceIdentity(value: string) {
  return value.normalize("NFKC").toLowerCase();
}

export function isAllowedWorkspaceIdentity(value: string) {
  const normalizedValue = normalizeWorkspaceIdentity(value);
  const tokens = normalizedValue.match(/[a-z0-9]+/g) ?? [];

  return (
    !tokens.some((token) => RESERVED_WORKSPACE_IDENTITY_TOKENS.has(token)) &&
    !workspaceIdentityProfanity.exists(normalizedValue)
  );
}
