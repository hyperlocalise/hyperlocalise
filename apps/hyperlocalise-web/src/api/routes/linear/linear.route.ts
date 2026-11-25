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

import { hasCapability } from "@/api/auth/policy";
import { canAccessProject } from "@/api/auth/team-access";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import {
  badRequestResponse,
  forbiddenResponse,
  serviceUnavailableResponse,
  tooManyRequestsResponse,
} from "@/api/response.schema";
import { env } from "@/lib/env";
import { loadLinearClient } from "@/lib/linear/credentials";
import {
  createLinearIssuesForQaFindings,
  loadLinearQaFindings,
  type LinearQaFinding,
  type LinearQaFindingIssueResult,
} from "@/lib/linear/qa-finding-issues";
import type { LinearClientError } from "@/lib/linear/types";
import { createLogger } from "@/lib/log";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";
import { isErr } from "@/lib/primitives/result/results";

import { linearQaFindingIssuesBodySchema } from "./linear.schema";

const logger = createLogger("linear-routes");

type LinearRouteContext = Parameters<typeof badRequestResponse>[0];

function mapLinearError(c: LinearRouteContext, error: LinearClientError) {
  switch (error.code) {
    case "linear_not_connected":
    case "linear_pipes_needs_reauthorization":
    case "linear_credentials_invalid":
      return badRequestResponse(c, error.code, error.message);
    case "linear_rate_limited":
      return tooManyRequestsResponse(c, error.code, error.message);
    case "linear_pipes_unavailable":
    case "linear_request_failed":
      return serviceUnavailableResponse(c, error.code, error.message);
    default:
      return assertNever(error);
  }
}

function qaPageUrl(organizationSlug: string | null, finding: LinearQaFinding) {
  const origin = env.HYPERLOCALISE_PUBLIC_APP_URL;
  if (!origin || !organizationSlug) {
    return null;
  }
  return `${origin.replace(/\/$/, "")}/org/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(finding.projectId)}/qa`;
}

const validateQaFindingIssuesBody = validator("json", (value, c) => {
  const parsed = linearQaFindingIssuesBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_linear_issue_payload", "Choose a team and findings.");
  }
  return parsed.data;
});

export function createLinearRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/teams", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "reviews:approve")) {
        return forbiddenResponse(c, "forbidden");
      }

      const loaded = await loadLinearClient({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
      });
      if (isErr(loaded)) {
        return mapLinearError(c, loaded.error);
      }

      const teams = await loaded.value.client.listTeams({ signal: c.req.raw.signal });
      if (isErr(teams)) {
        return mapLinearError(c, teams.error);
      }
      return c.json({ teams: teams.value }, 200);
    })
    .post("/qa-finding-issues", validateQaFindingIssuesBody, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "reviews:approve")) {
        return forbiddenResponse(c, "forbidden");
      }

      const { teamId, findingIds } = c.req.valid("json");
      const organizationId = c.var.auth.organization.localOrganizationId;
      const loadedFindings = await loadLinearQaFindings({ organizationId, findingIds });

      const accessibleProjectIds = new Set<string>();
      for (const projectId of new Set(loadedFindings.map((finding) => finding.projectId))) {
        if (await canAccessProject(c.var.auth, projectId)) {
          accessibleProjectIds.add(projectId);
        }
      }
      const findings = loadedFindings.filter((finding) =>
        accessibleProjectIds.has(finding.projectId),
      );
      if (findings.length === 0) {
        return badRequestResponse(
          c,
          "linear_findings_unavailable",
          "None of these findings are open in a project you can access.",
        );
      }

      const loaded = await loadLinearClient({
        localOrganizationId: organizationId,
        workosUserId: c.var.auth.user.workosUserId,
      });
      if (isErr(loaded)) {
        return mapLinearError(c, loaded.error);
      }

      const organizationSlug = c.var.auth.organization.slug ?? null;
      const results = await createLinearIssuesForQaFindings({
        client: loaded.value.client,
        teamId,
        findings,
        qaPageUrl: (finding) => qaPageUrl(organizationSlug, finding),
      });
      const created = results.filter(
        (result): result is Extract<LinearQaFindingIssueResult, { ok: true }> => result.ok,
      );
      const failedCodes = results.flatMap((result) => (result.ok ? [] : [result.code]));

      logger.info(
        {
          organizationId,
          requestedCount: findingIds.length,
          createdCount: created.length,
          failedCount: failedCodes.length,
          skippedCount: findingIds.length - findings.length,
        },
        "linear issues created from qa findings",
      );

      if (created.length === 0 && failedCodes[0]) {
        return mapLinearError(c, {
          code: failedCodes[0],
          message: "Linear did not create the issues.",
        });
      }

      return c.json(
        {
          issues: created.map((result) => ({
            findingId: result.findingId,
            identifier: result.identifier,
            url: result.url,
          })),
          failedCount: failedCodes.length,
          skippedCount: findingIds.length - findings.length,
        },
        201,
      );
    });
}
