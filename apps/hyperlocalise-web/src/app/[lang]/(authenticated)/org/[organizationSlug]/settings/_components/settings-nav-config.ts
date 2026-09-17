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
  "activity-logs",
  "members",
  "integrations",
  "ai-engine",
  "domains",
  "hyperlab",
  "billing",
  "api-keys",
  "account",
] as const;

export type SettingsNavItemId = (typeof settingsNavItemIds)[number];

export const settingsNavGroupIds = [
  "workspace",
  "members-teams",
  "integrations-ai",
  "apps",
  "billing",
  "developer",
  "you",
] as const;

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
      {
        id: "activity-logs",
        href: "activity-logs",
        requiredCapability: "activity_logs:read",
      },
    ],
  },
  {
    id: "members-teams",
    items: [{ id: "members", href: "members" }],
  },
  {
    id: "integrations-ai",
    items: [
      { id: "integrations", href: "integrations", requiredCapability: "integrations:read" },
      { id: "ai-engine", href: "ai-engine" },
    ],
  },
  {
    id: "apps",
    items: [
      { id: "domains", href: "domains" },
      { id: "hyperlab", href: "hyperlab", requiredCapability: "experiments:read" },
    ],
  },
  {
    id: "billing",
    items: [{ id: "billing", href: "billing", requiredCapability: "billing:read" }],
  },
  {
    id: "developer",
    items: [{ id: "api-keys", href: "api-keys", requiredCapability: "api_keys:read" }],
  },
  {
    id: "you",
    items: [{ id: "account", href: "account" }],
  },
];

export function buildSettingsItemHref(organizationSlug: string, href: string) {
  if (href.startsWith("/")) {
    return `/org/${organizationSlug}${href}`;
  }
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
  const orgRoot = `/org/${organizationSlug}`;

  if (
    normalizedPath.startsWith(`${settingsRoot}/members`) ||
    normalizedPath.startsWith(`${orgRoot}/members`) ||
    normalizedPath.startsWith(`${orgRoot}/teams`)
  ) {
    return "members";
  }

  if (
    normalizedPath.startsWith(`${settingsRoot}/integrations`) ||
    normalizedPath.startsWith(`${orgRoot}/integrations`)
  ) {
    return "integrations";
  }

  if (
    normalizedPath.startsWith(`${settingsRoot}/ai-engine`) ||
    normalizedPath.startsWith(`${orgRoot}/ai-engine`)
  ) {
    return "ai-engine";
  }

  if (
    normalizedPath.startsWith(`${settingsRoot}/domains`) ||
    normalizedPath.startsWith(`${settingsRoot}/linked-domains`) ||
    normalizedPath === `${orgRoot}/domains` ||
    normalizedPath.startsWith(`${orgRoot}/domains/`)
  ) {
    return "domains";
  }

  if (
    normalizedPath.startsWith(`${settingsRoot}/hyperlab`) ||
    normalizedPath.startsWith(`${orgRoot}/hyperlab`)
  ) {
    return "hyperlab";
  }

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
