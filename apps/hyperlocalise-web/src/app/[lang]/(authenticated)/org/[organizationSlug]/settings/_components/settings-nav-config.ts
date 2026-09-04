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

import type { OrganizationCapability } from "@/api/auth/policy";
import { stripAppLocalePrefix } from "@/components/app-shell/navigation-config";

export const settingsNavItemIds = [
  "general",
  "billing",
  "activity-logs",
  "account",
  "api-keys",
] as const;

export type SettingsNavItemId = (typeof settingsNavItemIds)[number];

export const settingsNavGroupIds = ["workspace", "you", "developer"] as const;

export type SettingsNavGroupId = (typeof settingsNavGroupIds)[number];

export type SettingsNavItemConfig = {
  id: SettingsNavItemId;
  href: string;
  requiredCapability?: OrganizationCapability;
};

export type SettingsNavGroupConfig = {
  id: SettingsNavGroupId;
  items: readonly SettingsNavItemConfig[];
};

export const settingsNavGroups: readonly SettingsNavGroupConfig[] = [
  {
    id: "workspace",
    items: [
      { id: "general", href: "" },
      { id: "billing", href: "billing", requiredCapability: "billing:read" },
      {
        id: "activity-logs",
        href: "activity-logs",
        requiredCapability: "activity_logs:read",
      },
    ],
  },
  {
    id: "you",
    items: [{ id: "account", href: "account" }],
  },
  {
    id: "developer",
    items: [{ id: "api-keys", href: "api-keys", requiredCapability: "api_keys:read" }],
  },
];

export function buildSettingsItemHref(organizationSlug: string, href: string) {
  return href ? `/org/${organizationSlug}/settings/${href}` : `/org/${organizationSlug}/settings`;
}

export function filterVisibleSettingsNavGroups(
  groups: readonly SettingsNavGroupConfig[],
  capabilities: readonly OrganizationCapability[],
): SettingsNavGroupConfig[] {
  return groups.flatMap((group) => {
    const items = group.items.filter((item) => {
      if (!item.requiredCapability) {
        return true;
      }
      return capabilities.includes(item.requiredCapability);
    });

    if (items.length === 0) {
      return [];
    }

    return [{ ...group, items }];
  });
}

export function resolveActiveSettingsNavItem(
  pathname: string | null,
  organizationSlug: string,
): SettingsNavItemId {
  const normalizedPath = stripAppLocalePrefix(pathname);
  const settingsRoot = `/org/${organizationSlug}/settings`;

  if (normalizedPath === settingsRoot) {
    return "general";
  }

  if (normalizedPath.startsWith(`${settingsRoot}/billing`)) {
    return "billing";
  }

  if (normalizedPath.startsWith(`${settingsRoot}/activity-logs`)) {
    return "activity-logs";
  }

  if (normalizedPath.startsWith(`${settingsRoot}/account`)) {
    return "account";
  }

  if (normalizedPath.startsWith(`${settingsRoot}/api-keys`)) {
    return "api-keys";
  }

  return "general";
}
