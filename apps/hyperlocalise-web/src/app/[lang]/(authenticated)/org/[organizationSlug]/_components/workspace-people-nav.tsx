"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormattedMessage, useIntl } from "react-intl";

import { stripAppLocalePrefix } from "@/components/app-shell/navigation-config";
import { cn } from "@/lib/primitives/cn";

import { workspacePeopleNavMessages as messages } from "./workspace-people-nav.messages";

type WorkspacePeopleSection = "teams" | "members";

const peopleSections: readonly {
  id: WorkspacePeopleSection;
  labelMessage: typeof messages.teams;
}[] = [
  {
    id: "teams",
    labelMessage: messages.teams,
  },
  {
    id: "members",
    labelMessage: messages.members,
  },
] as const;

function resolveActiveSection(
  pathname: string | null,
  organizationSlug: string,
): WorkspacePeopleSection {
  if (!pathname) {
    return "teams";
  }

  const basePath = `/org/${organizationSlug}`;
  const normalizedPath = stripAppLocalePrefix(pathname);

  if (normalizedPath.startsWith(`${basePath}/members`)) {
    return "members";
  }

  return "teams";
}

export function WorkspacePeopleNav({ organizationSlug }: { organizationSlug: string }) {
  const pathname = usePathname();
  const intl = useIntl();
  const activeSection = resolveActiveSection(pathname, organizationSlug);

  return (
    <nav aria-label={intl.formatMessage(messages.navAriaLabel)} className="border-b border-border">
      <div className="flex flex-wrap gap-1">
        {peopleSections.map((section) => {
          const href = `/org/${organizationSlug}/${section.id}`;
          const isActive = activeSection === section.id;

          return (
            <Link
              key={section.id}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative inline-flex items-center px-3 py-2.5 text-sm font-medium transition-colors",
                "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:transition-opacity",
                isActive
                  ? "text-foreground after:bg-foreground after:opacity-100"
                  : "text-muted-foreground hover:text-foreground after:opacity-0",
              )}
            >
              <FormattedMessage {...section.labelMessage} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
