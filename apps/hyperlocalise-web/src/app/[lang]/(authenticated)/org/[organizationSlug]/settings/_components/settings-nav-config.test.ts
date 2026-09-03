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

import {
  filterVisibleSettingsNavGroups,
  resolveActiveSettingsNavItem,
  settingsNavGroups,
} from "./settings-nav-config";

describe("settings nav config", () => {
  it("shows general, account, and access tokens without extra capabilities", () => {
    const visible = filterVisibleSettingsNavGroups(settingsNavGroups, []);

    expect(visible.map((group) => group.id)).toEqual(["workspace", "you"]);
    expect(visible.flatMap((group) => group.items.map((item) => item.id))).toEqual([
      "general",
      "account",
      "access-tokens",
    ]);
  });

  it("keeps billing and API keys behind their read capabilities", () => {
    const visible = filterVisibleSettingsNavGroups(settingsNavGroups, [
      "api_keys:read",
      "billing:read",
    ]);

    expect(visible.flatMap((group) => group.items.map((item) => item.id))).toEqual([
      "general",
      "billing",
      "account",
      "access-tokens",
      "api-keys",
    ]);
  });

  it("resolves the active settings nav item from the pathname", () => {
    expect(resolveActiveSettingsNavItem("/org/acme/settings", "acme")).toBe("general");
    expect(resolveActiveSettingsNavItem("/en/org/acme/settings/billing", "acme")).toBe("billing");
    expect(resolveActiveSettingsNavItem("/org/acme/settings/account", "acme")).toBe("account");
    expect(resolveActiveSettingsNavItem("/org/acme/settings/personal-access-tokens", "acme")).toBe(
      "access-tokens",
    );
    expect(resolveActiveSettingsNavItem("/org/acme/settings/api-keys", "acme")).toBe("api-keys");
  });
});
