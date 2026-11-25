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

import { verifyGoSvcServiceToken } from "@/lib/go-svc/go-svc-service-token";
import { runIrisAutomationAction } from "@/lib/automations/iris-automation-actions";
import {
  runIrisProjectAction,
  type IrisProjectActionDeps,
} from "@/lib/projects/iris-project-actions";
import { serviceUnavailableResponse, unauthorizedResponse } from "@/api/response.schema";

export function createIrisProjectActionRoutes(deps: IrisProjectActionDeps) {
  return new Hono()
    .use("*", async (c, next) => {
      const auth = verifyGoSvcServiceToken(c.req.raw);
      if (!auth.ok) {
        if (auth.reason === "misconfigured") {
          return serviceUnavailableResponse(c, "project_workflow_unconfigured");
        }
        return unauthorizedResponse(c, "unauthorized", "missing server call token");
      }
      await next();
    })
    .post("/project-action", async (c) => {
      const body = (await c.req.json().catch(() => null)) as {
        action?: string;
        payload?: Record<string, unknown>;
      } | null;
      if (!body?.action || !body.payload) {
        return c.json({ error: "invalid_request_body", message: "Invalid project action" }, 400);
      }
      const result = await runIrisProjectAction(body.action, body.payload, deps);
      return c.json(result.body, result.status as 200);
    })
    .post("/automation-action", async (c) => {
      const body = (await c.req.json().catch(() => null)) as {
        action?: string;
        payload?: Record<string, unknown>;
      } | null;
      if (!body?.action || !body.payload) {
        return c.json({ error: "invalid_request_body", message: "Invalid automation action" }, 400);
      }
      const result = await runIrisAutomationAction(body.action, body.payload);
      return c.json(result.body, result.status as 200);
    });
}
