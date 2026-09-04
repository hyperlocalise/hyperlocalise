"use client";

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
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormattedMessage, useIntl } from "react-intl";

import type { OrganizationCapability } from "@/api/auth/policy";
import { Box } from "@/components/ui/layout/box";
import { Rows } from "@/components/ui/layout/rows";
import { cn } from "@/lib/primitives/cn";

import {
  buildSettingsItemHref,
  filterVisibleSettingsNavGroups,
  resolveActiveSettingsNavItem,
  settingsNavGroups,
  type SettingsNavGroupId,
  type SettingsNavItemId,
} from "./settings-nav-config";
import { settingsNavMessages as messages } from "./settings-nav.messages";

const groupMessages = {
  workspace: messages.workspaceGroup,
  you: messages.youGroup,
  developer: messages.developerGroup,
} as const satisfies Record<SettingsNavGroupId, typeof messages.workspaceGroup>;

const itemMessages = {
  general: messages.general,
  billing: messages.billing,
  "activity-logs": messages.activityLogs,
  account: messages.account,
  "api-keys": messages.apiKeys,
} as const satisfies Record<SettingsNavItemId, typeof messages.general>;

export function SettingsNav({
  organizationSlug,
  capabilities,
}: {
  organizationSlug: string;
  capabilities: readonly OrganizationCapability[];
}) {
  const intl = useIntl();
  const pathname = usePathname();
  const activeItem = resolveActiveSettingsNavItem(pathname, organizationSlug);
  const visibleGroups = filterVisibleSettingsNavGroups(settingsNavGroups, capabilities);

  return (
    <nav
      aria-label={intl.formatMessage(messages.navAriaLabel)}
      className="w-full border-b border-border md:h-full md:w-[13.75rem] md:overflow-y-auto md:border-r md:border-b-0"
    >
      <Box paddingTop="3u" paddingBottom="4u" paddingStart="2u" paddingEnd="1.5u">
        <Rows spacing="3u">
          {visibleGroups.map((group) => (
            <Rows key={group.id} spacing="0.5u">
              <Box paddingStart="1.5u">
                <span className="text-xs font-medium tracking-wider text-subtle-foreground uppercase">
                  <FormattedMessage {...groupMessages[group.id]} />
                </span>
              </Box>
              {group.items.map((item) => {
                const href = buildSettingsItemHref(organizationSlug, item.href);
                const isActive = item.id === activeItem;

                return (
                  <Link
                    key={item.id}
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex h-8 items-center rounded-lg px-2.5 text-sm",
                      isActive
                        ? "bg-secondary font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <FormattedMessage {...itemMessages[item.id]} />
                  </Link>
                );
              })}
            </Rows>
          ))}
        </Rows>
      </Box>
    </nav>
  );
}
