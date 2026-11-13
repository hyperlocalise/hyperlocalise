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

import { cn } from "@/lib/primitives/cn";

/** What an automation icon's colour stands for, the same on every automations screen. */
export const AUTOMATION_ICON_TONES = {
  /** What starts the automation. */
  trigger: "bg-blue-100 text-blue-900",
  /** Part of Hyperlocalise, usable without an outside connection. */
  builtIn: "bg-spruce-100 text-spruce-900",
  /** An outside service: its mark keeps its own brand colour on a plain tile. */
  external: "bg-background text-foreground ring-1 ring-border",
} as const;

export type AutomationIconTone = keyof typeof AUTOMATION_ICON_TONES;

/**
 * The same tones for a bare icon, where a tile would crowd the line. Inside a disabled menu item
 * the icon goes grey, so colour also says the thing can be used.
 */
export const AUTOMATION_ICON_GLYPH_TONES = {
  trigger: "text-blue-900 in-data-disabled:text-muted-foreground",
  builtIn: "text-spruce-900 in-data-disabled:text-muted-foreground",
} as const;

/** A fixed-size slot for a row's icon, tinted by tone. Without a tone the icon stays grey. */
export function AutomationIconTile({
  children,
  className,
  tone,
}: {
  children: ReactNode;
  className?: string;
  tone?: AutomationIconTone;
}) {
  return (
    <span
      data-slot="automation-icon-tile"
      data-tone={tone}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md",
        tone ? AUTOMATION_ICON_TONES[tone] : "text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
