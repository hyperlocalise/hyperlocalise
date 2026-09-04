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
import { badRequestResponse, forbiddenResponse } from "@/api/response.schema";
import { hasCapability } from "@/api/auth/policy";
import {
  listActivityLogEvents,
  InvalidActivityLogCursorError,
  type ActivityLogActorFilter,
} from "@/lib/activity-log/activity-log-reader";
import { activityLogQuerySchema } from "./activity-log.schema";

function parseQuery(url: string) {
  const searchParams = new URL(url).searchParams;
  const parsed = activityLogQuerySchema.safeParse({
    actor: searchParams.get("actor") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
    eventTypes: searchParams.getAll("eventTypes"),
    limit: searchParams.get("limit") ?? undefined,
    range: searchParams.get("range") ?? undefined,
  });
  return parsed;
}

function parseActorFilter(value: string | undefined): ActivityLogActorFilter | undefined {
  if (!value) return undefined;
  if (value.startsWith("user:")) {
    return { kind: "user", userId: value.slice("user:".length) };
  }
  return value as Exclude<ActivityLogActorFilter, { kind: "user" }>;
}

const validateActivityLogQuery = validator("query", (_value, c) => {
  const parsed = parseQuery(c.req.url);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_activity_log_query",
      "Activity log query is invalid",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

export function createActivityLogRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", validateActivityLogQuery, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "activity_logs:read")) {
        return forbiddenResponse(
          c,
          "activity_logs_read_forbidden",
          "Activity logs are restricted to workspace operators",
        );
      }

      let result;
      try {
        result = await listActivityLogEvents({
          organizationId: c.var.auth.organization.localOrganizationId,
          organizationSlug: c.req.param("organizationSlug") ?? "",
          query: {
            ...c.req.valid("query"),
            actor: parseActorFilter(c.req.valid("query").actor),
          },
        });
      } catch (error) {
        if (error instanceof InvalidActivityLogCursorError) {
          return badRequestResponse(
            c,
            "invalid_activity_log_cursor",
            "Activity log cursor is invalid",
          );
        }
        throw error;
      }

      return c.json(result, 200);
    });
}
