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
import {
  badRequestResponse,
  forbiddenResponse,
  serviceUnavailableResponse,
} from "@/api/response.schema";
import { loadMailchimpAutomationClient } from "@/lib/mailchimp/credentials";
import { listMailchimpLibrary } from "@/lib/mailchimp/list-library";
import type { MailchimpSettingsError } from "@/lib/mailchimp/types";
import { createLogger } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";

const logger = createLogger("mailchimp-routes");

function mapMailchimpError(
  c: Parameters<typeof badRequestResponse>[0],
  error: MailchimpSettingsError,
) {
  if (
    error.code === "mailchimp_pipes_unavailable" ||
    error.code === "mailchimp_temporarily_unavailable"
  ) {
    return serviceUnavailableResponse(c, error.code, error.message);
  }
  return badRequestResponse(c, error.code, error.message);
}

export function createMailchimpRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/library", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "integrations:read")) {
        return forbiddenResponse(c, "forbidden");
      }

      const loaded = await loadMailchimpAutomationClient({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
      });
      if (isErr(loaded)) {
        return mapMailchimpError(c, loaded.error);
      }

      try {
        const library = await listMailchimpLibrary(loaded.value.client);
        return c.json({ library }, 200);
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          "mailchimp library list failed",
        );
        return serviceUnavailableResponse(
          c,
          "mailchimp_temporarily_unavailable",
          "Mailchimp did not accept the request. Wait a moment and try again.",
        );
      }
    });
}
