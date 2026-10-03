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
import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";

import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { ProjectSectionTitle } from "../../_components/project-page-shell";
import type { Icon } from "../../../../_components/workspace-resource-shared";

export const projectSettingsSectionTones = {
  dew: "bg-dew-100 text-dew-900",
  grove: "bg-grove-100 text-grove-900",
  spruce: "bg-spruce-100 text-spruce-900",
  beam: "bg-beam-100 text-beam-900",
} as const;

export type ProjectSettingsSectionTone = keyof typeof projectSettingsSectionTones;

export function ProjectSettingsSectionHeading({
  icon,
  tone,
  title,
  description,
  actions,
}: {
  icon: Icon;
  tone: ProjectSettingsSectionTone;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span
          data-slot="project-settings-section-icon"
          data-tone={tone}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md",
            projectSettingsSectionTones[tone],
          )}
          aria-hidden
        >
          <HugeiconsIcon icon={icon} className="size-4" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <ProjectSectionTitle>{title}</ProjectSectionTitle>
          {description ? (
            <TypographyP className="mt-1" size="small" tone="subtle">
              {description}
            </TypographyP>
          ) : null}
        </div>
      </div>
      {actions}
    </div>
  );
}
