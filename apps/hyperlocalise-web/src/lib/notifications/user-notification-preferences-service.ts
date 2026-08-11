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
import { eq } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database";
import type { UserNotificationEmailFormat } from "@/lib/database/schema/issue-sheet";
import { createLogger } from "@/lib/log";

import {
  DEFAULT_USER_NOTIFICATION_PREFERENCES,
  type UserNotificationPreferences,
} from "./user-notification-preferences";

export {
  DEFAULT_USER_NOTIFICATION_PREFERENCES,
  type UserNotificationPreferences,
} from "./user-notification-preferences";

const logger = createLogger("user-notification-preferences-service");

export class UserNotificationPreferencesService {
  constructor(private readonly database: typeof db = db) {}

  async getForUser(
    userId: string,
    database: DatabaseClient = this.database,
  ): Promise<UserNotificationPreferences> {
    const [row] = await database
      .select({
        emailEnabled: schema.userNotificationPreferences.emailEnabled,
        emailFormat: schema.userNotificationPreferences.emailFormat,
      })
      .from(schema.userNotificationPreferences)
      .where(eq(schema.userNotificationPreferences.userId, userId))
      .limit(1);

    if (!row) {
      return { ...DEFAULT_USER_NOTIFICATION_PREFERENCES };
    }

    return {
      emailEnabled: row.emailEnabled,
      emailFormat: row.emailFormat,
    };
  }

  async upsertForUser(
    userId: string,
    input: UserNotificationPreferences,
    database: DatabaseClient = this.database,
  ): Promise<UserNotificationPreferences> {
    const emailFormat: UserNotificationEmailFormat =
      input.emailFormat === "immediate" ? "immediate" : "digest";

    const [row] = await database
      .insert(schema.userNotificationPreferences)
      .values({
        userId,
        emailEnabled: input.emailEnabled,
        emailFormat,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.userNotificationPreferences.userId,
        set: {
          emailEnabled: input.emailEnabled,
          emailFormat,
          updatedAt: new Date(),
        },
      })
      .returning({
        emailEnabled: schema.userNotificationPreferences.emailEnabled,
        emailFormat: schema.userNotificationPreferences.emailFormat,
      });

    if (!row) {
      logger.error({ userId }, "failed to upsert notification preferences");
      throw new Error("failed_to_upsert_notification_preferences");
    }

    return {
      emailEnabled: row.emailEnabled,
      emailFormat: row.emailFormat,
    };
  }
}

export const userNotificationPreferencesService = new UserNotificationPreferencesService();
