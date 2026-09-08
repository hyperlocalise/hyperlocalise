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
import { ApiIcon, BookOpen01Icon, ConnectIcon, Robot01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import { developerResourcesDocUrls } from "./overview-developer-resource-urls";
import { overviewDeveloperResourcesMessages as messages } from "./overview-developer-resources.messages";

type DeveloperResourceItem = {
  href: string;
  title: typeof messages.documentationTitle;
  description: typeof messages.documentationDescription;
  icon: ComponentProps<typeof HugeiconsIcon>["icon"];
};

const DEVELOPER_RESOURCE_ITEMS: readonly DeveloperResourceItem[] = [
  {
    href: developerResourcesDocUrls.gettingStarted,
    title: messages.documentationTitle,
    description: messages.documentationDescription,
    icon: BookOpen01Icon,
  },
  {
    href: developerResourcesDocUrls.mcp,
    title: messages.mcpTitle,
    description: messages.mcpDescription,
    icon: Robot01Icon,
  },
  {
    href: developerResourcesDocUrls.api,
    title: messages.apiTitle,
    description: messages.apiDescription,
    icon: ApiIcon,
  },
  {
    href: developerResourcesDocUrls.integrations,
    title: messages.integrationsTitle,
    description: messages.integrationsDescription,
    icon: ConnectIcon,
  },
];

export function OverviewDeveloperResources({ className }: { className?: string }) {
  const intl = useIntl();

  return (
    <section
      aria-labelledby="overview-developer-resources-title"
      className={cn("flex flex-col gap-4", className)}
    >
      <h2
        className="font-heading text-base font-medium text-foreground"
        id="overview-developer-resources-title"
      >
        <FormattedMessage {...messages.title} />
      </h2>

      <div aria-hidden className="border-b border-border" />

      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {DEVELOPER_RESOURCE_ITEMS.map((item) => (
          <li key={item.href}>
            <a
              className="group flex flex-col gap-2"
              href={item.href}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span className="inline-flex items-center gap-2">
                <HugeiconsIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  icon={item.icon}
                  strokeWidth={1.8}
                />
                <span className="text-sm font-medium text-foreground underline-offset-4 group-hover:underline">
                  {intl.formatMessage(item.title)}
                </span>
              </span>
              <span className="text-sm leading-5 text-muted-foreground">
                {intl.formatMessage(item.description)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
