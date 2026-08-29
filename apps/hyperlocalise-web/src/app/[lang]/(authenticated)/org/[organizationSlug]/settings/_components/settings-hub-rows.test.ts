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

import { buildSettingsHubRows, filterVisibleSettingsHubRows } from "./settings-hub-rows";

const intl = getIntlShape("en");

describe("settings hub rows", () => {
  it("shows personal access tokens to any member", () => {
    const rows = buildSettingsHubRows(intl, "acme");
    const visible = filterVisibleSettingsHubRows(rows, [], false);

    expect(visible.map((row) => row.href)).toEqual(["account", "personal-access-tokens"]);
  });

  it("keeps the organization API keys row behind api_keys:read", () => {
    const rows = buildSettingsHubRows(intl, "acme");
    const visible = filterVisibleSettingsHubRows(
      rows,
      ["api_keys:read", "billing:read"],
      false,
    );

    expect(visible.map((row) => row.href)).toEqual([
      "account",
      "personal-access-tokens",
      "api-keys",
      "billing",
    ]);
  });
});
