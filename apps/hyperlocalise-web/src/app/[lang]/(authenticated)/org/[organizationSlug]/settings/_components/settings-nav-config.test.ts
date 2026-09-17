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
  buildSettingsItemHref,
  filterVisibleSettingsNavGroups,
  resolveActiveSettingsNavItem,
  settingsNavGroups,
} from "./settings-nav-config";

describe("settings nav config", () => {
  it("shows open items without extra capabilities", () => {
    const visible = filterVisibleSettingsNavGroups(settingsNavGroups, []);

    expect(visible.map((group) => group.id)).toEqual([
      "workspace",
      "members-teams",
      "integrations-ai",
      "apps",
      "you",
    ]);
    expect(visible.flatMap((group) => group.items.map((item) => item.id))).toEqual([
      "general",
      "members",
      "ai-engine",
      "domains",
      "account",
    ]);
  });

  it("keeps gated items behind their read capabilities", () => {
    const visible = filterVisibleSettingsNavGroups(settingsNavGroups, [
      "api_keys:read",
      "billing:read",
      "activity_logs:read",
      "integrations:read",
      "experiments:read",
    ]);

    expect(visible.flatMap((group) => group.items.map((item) => item.id))).toEqual([
      "general",
      "activity-logs",
      "members",
      "integrations",
      "ai-engine",
      "domains",
      "hyperlab",
      "billing",
      "api-keys",
      "account",
    ]);
  });

  it("builds settings destinations under the settings layout", () => {
    expect(buildSettingsItemHref("acme", "members")).toBe("/org/acme/settings/members");
    expect(buildSettingsItemHref("acme", "integrations")).toBe("/org/acme/settings/integrations");
    expect(buildSettingsItemHref("acme", "ai-engine")).toBe("/org/acme/settings/ai-engine");
    expect(buildSettingsItemHref("acme", "domains")).toBe("/org/acme/settings/domains");
    expect(buildSettingsItemHref("acme", "hyperlab")).toBe("/org/acme/settings/hyperlab");
    expect(buildSettingsItemHref("acme", "")).toBe("/org/acme/settings");
  });

  it("resolves the active settings nav item from the pathname", () => {
    expect(resolveActiveSettingsNavItem("/org/acme/settings", "acme")).toBe("general");
    expect(resolveActiveSettingsNavItem("/en/org/acme/settings/billing", "acme")).toBe("billing");
    expect(resolveActiveSettingsNavItem("/org/acme/settings/activity-logs", "acme")).toBe(
      "activity-logs",
    );
    expect(resolveActiveSettingsNavItem("/org/acme/settings/members", "acme")).toBe("members");
    expect(resolveActiveSettingsNavItem("/org/acme/members", "acme")).toBe("members");
    expect(resolveActiveSettingsNavItem("/en/org/acme/teams", "acme")).toBe("members");
    expect(resolveActiveSettingsNavItem("/org/acme/settings/integrations", "acme")).toBe(
      "integrations",
    );
    expect(resolveActiveSettingsNavItem("/org/acme/integrations", "acme")).toBe("integrations");
    expect(resolveActiveSettingsNavItem("/org/acme/settings/ai-engine", "acme")).toBe("ai-engine");
    expect(resolveActiveSettingsNavItem("/org/acme/ai-engine", "acme")).toBe("ai-engine");
    expect(resolveActiveSettingsNavItem("/org/acme/settings/domains", "acme")).toBe("domains");
    expect(resolveActiveSettingsNavItem("/org/acme/settings/linked-domains", "acme")).toBe(
      "domains",
    );
    expect(resolveActiveSettingsNavItem("/org/acme/domains", "acme")).toBe("domains");
    expect(resolveActiveSettingsNavItem("/org/acme/settings/hyperlab", "acme")).toBe("hyperlab");
    expect(resolveActiveSettingsNavItem("/org/acme/hyperlab", "acme")).toBe("hyperlab");
    expect(resolveActiveSettingsNavItem("/org/acme/settings/account", "acme")).toBe("account");
    expect(resolveActiveSettingsNavItem("/org/acme/settings/api-keys", "acme")).toBe("api-keys");
  });
});
