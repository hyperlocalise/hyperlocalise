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
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { validationErrorResponse } from "@/api/errors";
import { userNotificationPreferencesService } from "@/lib/notifications/user-notification-preferences-service";

import { updateNotificationPreferencesBodySchema } from "./notification-preferences.schema";

const validateUpdateBody = validator("json", (value, c) => {
  const parsed = updateNotificationPreferencesBodySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_notification_preferences_payload",
      "Notification preferences payload is invalid",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

export function createNotificationPreferencesRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      const preferences = await userNotificationPreferencesService.getForUser(
        c.var.auth.user.localUserId,
      );
      return c.json({ preferences }, 200);
    })
    .put("/", validateUpdateBody, async (c) => {
      const body = c.req.valid("json");
      const preferences = await userNotificationPreferencesService.upsertForUser(
        c.var.auth.user.localUserId,
        body,
      );
      return c.json({ preferences }, 200);
    });
}
