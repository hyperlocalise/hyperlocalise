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

/**
 * Column template shared by the side-by-side header and every row. Requires an
 * `@container` ancestor: narrow editor panes stack status above source on the
 * left with the translation spanning the right.
 */
export const SIDE_BY_SIDE_GRID_CLASS_NAME =
  "grid grid-cols-2 grid-rows-[auto_1fr] gap-x-4 [grid-template-areas:'status_target'_'source_target'] @3xl:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)] @3xl:grid-rows-1 @3xl:[grid-template-areas:'status_source_target']";

export const SIDE_BY_SIDE_STATUS_AREA_CLASS_NAME = "min-w-0 [grid-area:status]";
export const SIDE_BY_SIDE_SOURCE_AREA_CLASS_NAME = "min-w-0 self-start [grid-area:source]";
export const SIDE_BY_SIDE_TARGET_AREA_CLASS_NAME = "min-w-0 self-start [grid-area:target]";
