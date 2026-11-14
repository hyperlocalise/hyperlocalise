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
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./organizations";

export const USER_APPEARANCE_THEMES = ["light", "dark", "system"] as const;
export type UserAppearanceTheme = (typeof USER_APPEARANCE_THEMES)[number];

export const USER_HOUR_CYCLES = ["h12", "h23"] as const;
export type UserHourCycle = (typeof USER_HOUR_CYCLES)[number];

/**
 * Account-scoped appearance: color theme, UI locale, timezone, and clock.
 * Notification email delivery stays on user_notification_preferences.
 */
export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  theme: text("theme").$type<UserAppearanceTheme>().notNull(),
  locale: text("locale").notNull(),
  timezone: text("timezone").notNull(),
  hourCycle: text("hour_cycle").$type<UserHourCycle>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});
