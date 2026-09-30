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
import { Rows } from "@/components/ui/layout/rows";
import { TypographyP } from "@/components/ui/typography";

export function SettingsPageHeader({ title }: { title: string }) {
  return <h1 className="sr-only">{title}</h1>;
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
      <div className={width === "form" ? "w-full max-w-xl" : "w-full max-w-5xl"}>{children}</div>
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
      <TypographyP className="leading-tight" size="small" weight="medium" tone="content">
        {title}
      </TypographyP>
      <TypographyP className="leading-tight" wrapStyle="pretty" size="small" tone="subtle">
        {description}
      </TypographyP>
    </Rows>
  );
}

export function SettingsLayoutFrame({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
      <div className="w-full shrink-0 md:h-full md:w-auto">{nav}</div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
