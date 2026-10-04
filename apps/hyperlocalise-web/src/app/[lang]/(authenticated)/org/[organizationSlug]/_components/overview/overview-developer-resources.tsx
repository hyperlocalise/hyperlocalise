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
import { PlugsConnectedIcon, BookOpenIcon, RobotIcon, type Icon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import { developerResourcesDocUrls } from "./overview-developer-resource-urls";
import { overviewDeveloperResourcesMessages as messages } from "./overview-developer-resources.messages";
import { createElement } from "react";

type DeveloperResourceItem = {
  href: string;
  title: typeof messages.documentationTitle;
  description: typeof messages.documentationDescription;
  icon: Icon;
};

const DEVELOPER_RESOURCE_ITEMS: readonly DeveloperResourceItem[] = [
  {
    href: developerResourcesDocUrls.gettingStarted,
    title: messages.documentationTitle,
    description: messages.documentationDescription,
    icon: BookOpenIcon,
  },
  {
    href: developerResourcesDocUrls.mcp,
    title: messages.mcpTitle,
    description: messages.mcpDescription,
    icon: RobotIcon,
  },
  {
    href: developerResourcesDocUrls.api,
    title: messages.apiTitle,
    description: messages.apiDescription,
    icon: PlugsConnectedIcon,
  },
  {
    href: developerResourcesDocUrls.integrations,
    title: messages.integrationsTitle,
    description: messages.integrationsDescription,
    icon: PlugsConnectedIcon,
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
                {createElement(item.icon, { className: "size-4 shrink-0 text-muted-foreground" })}
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
