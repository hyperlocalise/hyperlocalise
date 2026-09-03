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

import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Rows } from "@/components/ui/layout/rows";
import { TypographyH1, TypographyP } from "@/components/ui/typography";

export function SettingsPageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <Rows spacing="1u">
      <span className="text-xs font-medium tracking-wider text-subtle-foreground uppercase">
        {eyebrow}
      </span>
      <TypographyH1 className="font-sans text-2xl font-medium tracking-tight text-foreground md:text-2xl">
        {title}
      </TypographyH1>
      <TypographyP className="text-pretty text-sm leading-snug text-muted-foreground">
        {description}
      </TypographyP>
    </Rows>
  );
}

export function SettingsPageBody({
  children,
  width = "form",
}: {
  children: ReactNode;
  width?: "form" | "wide";
}) {
  return (
    <Box paddingTop="4u" paddingBottom="6u" paddingStart="4u" paddingEnd="6u">
      <div className={width === "form" ? "w-full max-w-xl" : "w-full max-w-4xl"}>{children}</div>
    </Box>
  );
}

export function SettingsSectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Rows spacing="0.5u">
      <TypographyP className="text-sm leading-tight font-medium text-foreground">
        {title}
      </TypographyP>
      <TypographyP className="text-pretty text-sm leading-tight text-muted-foreground">
        {description}
      </TypographyP>
    </Rows>
  );
}

export function SettingsLayoutFrame({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <Columns spacing="0" height="full" collapseBelow="medium">
        <Column width="content">{nav}</Column>
        <Column width="fluid">
          <div className="h-full min-h-0 overflow-y-auto">{children}</div>
        </Column>
      </Columns>
    </div>
  );
}
