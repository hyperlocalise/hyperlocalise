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
import { FormattedMessage, useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import { projectSettingsNavMessages as messages } from "./project-settings-nav.messages";

export type ProjectSettingsNavItemId =
  | "general"
  | "style-guide"
  | "locales"
  | "issue-templates"
  | "issue-columns"
  | "content-editor"
  | "cli";

type ProjectSettingsNavGroupId = "project" | "workflow" | "developer";

const PROJECT_SETTINGS_NAV_GROUPS: {
  id: ProjectSettingsNavGroupId;
  items: ProjectSettingsNavItemId[];
}[] = [
  { id: "project", items: ["general", "style-guide", "locales"] },
  { id: "workflow", items: ["issue-templates", "issue-columns", "content-editor"] },
  { id: "developer", items: ["cli"] },
];

const groupMessages = {
  project: messages.projectGroup,
  workflow: messages.workflowGroup,
  developer: messages.developerGroup,
} as const satisfies Record<ProjectSettingsNavGroupId, typeof messages.projectGroup>;

const itemMessages = {
  general: messages.general,
  "style-guide": messages.styleGuide,
  locales: messages.locales,
  "issue-templates": messages.issueTemplates,
  "issue-columns": messages.issueColumns,
  "content-editor": messages.contentEditor,
  cli: messages.cli,
} as const satisfies Record<ProjectSettingsNavItemId, typeof messages.general>;

export function ProjectSettingsNav({
  visibleItems,
  activeItem,
  dirtyItems,
  onSelect,
}: {
  visibleItems: ReadonlySet<ProjectSettingsNavItemId>;
  activeItem: ProjectSettingsNavItemId;
  dirtyItems: ReadonlySet<ProjectSettingsNavItemId>;
  onSelect: (item: ProjectSettingsNavItemId) => void;
}) {
  const intl = useIntl();

  return (
    <nav
      aria-label={intl.formatMessage(messages.navAriaLabel)}
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:sticky md:top-4 md:mx-0 md:w-52 md:shrink-0 md:flex-col md:gap-4 md:overflow-visible md:px-0 md:pb-0"
    >
      {PROJECT_SETTINGS_NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => visibleItems.has(item));
        if (items.length === 0) {
          return null;
        }

        return (
          <div key={group.id} className="flex gap-1 md:flex-col md:gap-0.5">
            <span className="hidden px-2.5 pb-1 text-xs font-medium tracking-wider text-subtle-foreground uppercase md:block">
              <FormattedMessage {...groupMessages[group.id]} />
            </span>
            {items.map((item) => {
              const isActive = item === activeItem;

              return (
                <button
                  key={item}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onSelect(item)}
                  className={cn(
                    "flex h-8 shrink-0 items-center gap-2 rounded-lg px-2.5 text-start text-sm whitespace-nowrap",
                    isActive
                      ? "bg-secondary font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">
                    <FormattedMessage {...itemMessages[item]} />
                  </span>
                  {dirtyItems.has(item) ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-primary">
                      <span className="sr-only">
                        <FormattedMessage {...messages.unsavedChanges} />
                      </span>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
