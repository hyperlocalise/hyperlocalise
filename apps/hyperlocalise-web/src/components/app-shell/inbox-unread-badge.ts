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

/** Cap an inbox unread count for sidebar badge display (`9+` above nine). */
export function formatInboxUnreadBadgeLabel(count: number): string | null {
  if (count <= 0) {
    return null;
  }

  if (count > 9) {
    return "9+";
  }

  return String(count);
}

/** Solid red unread badge styles with readable contrast in light and dark mode. */
export const inboxUnreadBadgeClassName =
  "bg-destructive-solid text-[0.625rem] leading-none font-semibold text-destructive-foreground peer-hover/menu-button:text-destructive-foreground peer-data-active/menu-button:text-destructive-foreground";
