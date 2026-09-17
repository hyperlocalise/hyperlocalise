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

import { isAllowedWorkspaceIdentity } from "./workspace-identity-policy";

describe("isAllowedWorkspaceIdentity", () => {
  it.each(["test", "testing", "demo", "example", "sample", "placeholder"])(
    "rejects the reserved token %s",
    (token) => {
      expect(isAllowedWorkspaceIdentity(`Acme ${token} Workspace`)).toBe(false);
      expect(isAllowedWorkspaceIdentity(`acme-${token}-workspace`)).toBe(false);
    },
  );

  it("matches reserved tokens case-insensitively after Unicode normalization", () => {
    expect(isAllowedWorkspaceIdentity("Acme TEST Workspace")).toBe(false);
    expect(isAllowedWorkspaceIdentity("Ａｃｍｅ ＴＥＳＴ Workspace")).toBe(false);
  });

  it("rejects profanity as a word or compound segment", () => {
    expect(isAllowedWorkspaceIdentity("Shit Happens Studio")).toBe(false);
    expect(isAllowedWorkspaceIdentity("acme-shit-studio")).toBe(false);
  });

  it("allows safe substrings", () => {
    expect(isAllowedWorkspaceIdentity("Contest Labs")).toBe(true);
    expect(isAllowedWorkspaceIdentity("contest-labs")).toBe(true);
    expect(isAllowedWorkspaceIdentity("Testingham Studio")).toBe(true);
  });
});
