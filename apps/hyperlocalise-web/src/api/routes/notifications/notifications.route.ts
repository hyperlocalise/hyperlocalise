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

import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { createZodValidator } from "@/api/errors";
import { forbiddenResponse, notFoundResponse } from "@/api/response.schema";
import { issueNotificationService } from "@/lib/projects/issue-sheet/issue-notification-service";

import {
  issueNotificationIdParamsSchema,
  issueNotificationsQuerySchema,
} from "./notifications.schema";

const validateIssueNotificationsQuery = createZodValidator(
  "query",
  issueNotificationsQuerySchema,
  "invalid_issue_notifications_query",
);

const validateIssueNotificationIdParams = createZodValidator(
  "param",
  issueNotificationIdParamsSchema,
  "invalid_issue_notification_id",
);

export function createIssueNotificationsRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", validateIssueNotificationsQuery, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "projects:read")) {
        return forbiddenResponse(c, "forbidden");
      }

      const query = c.req.valid("query");
      const result = await issueNotificationService.list(c.var.auth, query);
      return c.json(result, 200);
    })
    .get("/unread-count", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "projects:read")) {
        return forbiddenResponse(c, "forbidden");
      }

      const unreadCount = await issueNotificationService.unreadCount(c.var.auth);
      return c.json({ unreadCount }, 200);
    })
    .post("/read-all", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "projects:read")) {
        return forbiddenResponse(c, "forbidden");
      }

      const markedCount = await issueNotificationService.markAllRead(c.var.auth);
      return c.json({ markedCount }, 200);
    })
    .get("/:notificationId", validateIssueNotificationIdParams, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "projects:read")) {
        return forbiddenResponse(c, "forbidden");
      }

      const { notificationId } = c.req.valid("param");
      const notification = await issueNotificationService.getById(c.var.auth, notificationId);
      if (!notification) {
        return notFoundResponse(c, "notification_not_found");
      }

      return c.json({ notification }, 200);
    })
    .post("/:notificationId/read", validateIssueNotificationIdParams, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "projects:read")) {
        return forbiddenResponse(c, "forbidden");
      }

      const { notificationId } = c.req.valid("param");
      const result = await issueNotificationService.markRead(c.var.auth, notificationId);
      if (result === "not_found") {
        return notFoundResponse(c, "notification_not_found");
      }

      const notification = await issueNotificationService.getById(c.var.auth, notificationId);
      if (!notification) {
        return notFoundResponse(c, "notification_not_found");
      }

      return c.json(
        {
          notification: {
            id: notification.id,
            readAt: notification.readAt,
          },
        },
        200,
      );
    });
}
