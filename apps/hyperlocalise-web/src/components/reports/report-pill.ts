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

/** The round, quiet control shape the Reports toolbar shares with the Issues list header. */
export const REPORT_PILL =
  "inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-3 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-muted aria-expanded:text-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0";

/** A pill that is the chosen one in a group, such as the report on show. */
export const REPORT_PILL_ON = "border-transparent bg-muted text-foreground";
