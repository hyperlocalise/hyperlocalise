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

import { getIntlShape } from "@/lib/app-i18n/intl";

import {
  formatAccessTokenDate,
  selectOwnedAccessTokens,
  toggleAccessTokenPermission,
} from "./access-token-lifecycle";

const intl = getIntlShape("en");

describe("selectOwnedAccessTokens", () => {
  it("keeps only tokens owned by the current user", () => {
    const tokens = [
      { id: "mine", owner: { userId: "user_1" } },
      { id: "theirs", owner: { userId: "user_2" } },
      { id: "legacy", owner: null },
    ];

    expect(selectOwnedAccessTokens(tokens, "user_1")).toEqual([
      { id: "mine", owner: { userId: "user_1" } },
    ]);
  });
});

describe("formatAccessTokenDate", () => {
  it("returns the never-used label when lastUsedAt is null", () => {
    expect(formatAccessTokenDate(intl, null, "Never")).toBe("Never");
  });

  it("formats a timestamp for creation and last-used metadata", () => {
    expect(formatAccessTokenDate(intl, "2026-08-01T15:30:00.000Z", "Never")).toMatch(/Aug 1, 2026/);
  });
});

describe("toggleAccessTokenPermission", () => {
  it("adds and removes scopes without reordering the supported set", () => {
    expect(toggleAccessTokenPermission(["jobs:read"], "files:read", true)).toEqual([
      "jobs:read",
      "files:read",
    ]);
    expect(toggleAccessTokenPermission(["jobs:read", "files:read"], "jobs:read", false)).toEqual([
      "files:read",
    ]);
  });
});
