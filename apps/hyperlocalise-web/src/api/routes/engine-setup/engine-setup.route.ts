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
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { validationErrorResponse } from "@/api/errors";
import {
  apiErrorResponse,
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
} from "@/api/response.schema";
import { applyEngineSetup } from "@/lib/engine-setup/apply-engine-setup";
import {
  createEngineSetupRun,
  failEngineSetupRun,
  findEngineSetupRun,
  listEngineSetupRuns,
  listEngineSetupSuggestions,
  setEngineSetupWorkflowRunId,
  updateEngineSetupSuggestionStatuses,
  type EngineSetupRun,
  type EngineSetupSuggestion,
} from "@/lib/engine-setup/store";
import { workspaceKnowledgeFlag } from "@/lib/flags/workspace-flags";
import { canonicalizeLocale } from "@/lib/i18n/locales";
import { resolveDomainIdentity } from "@/lib/localisation-audit/domain-slug";
import { createLogger } from "@/lib/log";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";
import { isErr } from "@/lib/primitives/result/results";
import { assertResolvablePublicHttpUrl } from "@/lib/security/public-http-fetch";
import { formatSsrfGuardError } from "@/lib/security/ssrf-guard";
import type { EngineSetupQueue } from "@/lib/workflow/types";

import {
  applyEngineSetupRunBodySchema,
  ENGINE_SETUP_RUN_LIST_LIMIT,
  engineSetupRunParamsSchema,
  reviewEngineSetupSuggestionsBodySchema,
  startEngineSetupRunBodySchema,
} from "./engine-setup.schema";

const logger = createLogger("engine-setup-route");

const validateStartBody = validator("json", (value, c) => {
  const parsed = startEngineSetupRunBodySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_engine_setup_payload",
      "Engine setup payload is invalid",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateRunParams = validator("param", (value, c) => {
  const parsed = engineSetupRunParamsSchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_engine_setup_run_params",
      "Engine setup run is invalid",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateReviewBody = validator("json", (value, c) => {
  const parsed = reviewEngineSetupSuggestionsBodySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_engine_setup_review_payload",
      "Engine setup review payload is invalid",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateApplyBody = validator("json", (value, c) => {
  const parsed = applyEngineSetupRunBodySchema.safeParse(value ?? {});
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_engine_setup_apply_payload",
      "Engine setup apply payload is invalid",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

function canManageEngineSetup(role: AuthVariables["auth"]["membership"]["role"]) {
  // Apply writes org knowledge memory and org glossaries, so it needs both rights.
  return hasCapability(role, "workspace:update") && hasCapability(role, "glossaries:write");
}

async function isEngineSetupEnabled(auth: AuthVariables["auth"]) {
  try {
    return (
      (await workspaceKnowledgeFlag.run({
        identify: () => ({
          organization: { id: auth.organization.workosOrganizationId },
          user: { id: auth.user.workosUserId },
        }),
      })) === true
    );
  } catch {
    return false;
  }
}

function toEngineSetupRunRecord(run: EngineSetupRun) {
  return {
    id: run.id,
    sourceKind: run.sourceKind,
    sourceUrl: run.sourceUrl,
    sourceLocale: run.sourceLocale,
    status: run.status,
    progressStage: run.progressStage,
    pagesRead: run.pagesRead,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    appliedGlossaryId: run.appliedGlossaryId,
    appliedKnowledgeRevisionId: run.appliedKnowledgeRevisionId,
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    appliedAt: run.appliedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
  };
}

function toEngineSetupSuggestionRecord(suggestion: EngineSetupSuggestion) {
  return {
    id: suggestion.id,
    kind: suggestion.kind,
    payload: suggestion.payload,
    evidence: suggestion.evidence,
    confidence: suggestion.confidence,
    status: suggestion.status,
    conflict: suggestion.conflict,
    appliedAt: suggestion.appliedAt?.toISOString() ?? null,
  };
}

export function createEngineSetupRoutes(options: { engineSetupQueue: EngineSetupQueue }) {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .use("*", async (c, next) => {
      if (!(await isEngineSetupEnabled(c.var.auth))) {
        return forbiddenResponse(
          c,
          "feature_unavailable",
          "Workspace knowledge is not enabled for this organization",
        );
      }
      await next();
    })
    .get("/", async (c) => {
      const runs = await listEngineSetupRuns(
        c.var.auth.organization.localOrganizationId,
        ENGINE_SETUP_RUN_LIST_LIMIT,
      );
      return c.json({ engineSetupRuns: runs.map(toEngineSetupRunRecord) }, 200);
    })
    .post("/", validateStartBody, async (c) => {
      if (!canManageEngineSetup(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden", "Only workspace admins can run engine setup");
      }

      const payload = c.req.valid("json");
      const identity = resolveDomainIdentity(payload.url);
      if (isErr(identity)) {
        if (identity.error.code === "empty_slug") {
          return badRequestResponse(c, "invalid_engine_setup_url", "Enter a website address.");
        }
        return badRequestResponse(c, identity.error.code, formatSsrfGuardError(identity.error));
      }
      const resolvable = await assertResolvablePublicHttpUrl(identity.value.sourceUrl);
      if (isErr(resolvable)) {
        return badRequestResponse(c, resolvable.error.code, formatSsrfGuardError(resolvable.error));
      }

      const created = await createEngineSetupRun({
        organizationId: c.var.auth.organization.localOrganizationId,
        createdByUserId: c.var.auth.user.localUserId,
        sourceUrl: identity.value.sourceUrl,
        sourceLocale: payload.sourceLocale ? canonicalizeLocale(payload.sourceLocale) : null,
      });
      if (isErr(created)) {
        switch (created.error.code) {
          case "engine_setup_run_in_progress":
            return apiErrorResponse(
              c,
              409,
              created.error.code,
              "An engine setup run is already in progress",
              { runId: created.error.runId },
            );
          case "engine_setup_daily_limit_reached":
            return apiErrorResponse(
              c,
              429,
              created.error.code,
              "Engine setup can run a few times per day. Try again tomorrow.",
            );
          default:
            return assertNever(created.error);
        }
      }

      const run = created.value;
      try {
        const queued = await options.engineSetupQueue.enqueue({ runId: run.id });
        const workflowRunId = queued.ids[0];
        if (workflowRunId) {
          await setEngineSetupWorkflowRunId(run.id, workflowRunId);
        }
      } catch (error) {
        logger.error("engine setup enqueue failed", {
          runId: run.id,
          err: error instanceof Error ? error.name : "unknown",
        });
        await failEngineSetupRun({
          runId: run.id,
          status: "failed",
          errorCode: "engine_setup_enqueue_failed",
          errorMessage: "We could not start setup. Try again in a few minutes.",
        });
        return apiErrorResponse(
          c,
          503,
          "engine_setup_enqueue_failed",
          "We could not start setup. Try again in a few minutes.",
        );
      }

      return c.json({ engineSetupRun: toEngineSetupRunRecord(run) }, 202);
    })
    .get("/:runId", validateRunParams, async (c) => {
      const { runId } = c.req.valid("param");
      const run = await findEngineSetupRun(runId, c.var.auth.organization.localOrganizationId);
      if (!run) {
        return notFoundResponse(c, "engine_setup_run_not_found", "Engine setup run was not found");
      }
      const suggestions = await listEngineSetupSuggestions(run.id);
      return c.json(
        {
          engineSetupRun: toEngineSetupRunRecord(run),
          suggestions: suggestions.map(toEngineSetupSuggestionRecord),
        },
        200,
      );
    })
    .patch("/:runId/suggestions", validateRunParams, validateReviewBody, async (c) => {
      if (!canManageEngineSetup(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden", "Only workspace admins can review engine setup");
      }
      const { runId } = c.req.valid("param");
      const payload = c.req.valid("json");
      const run = await findEngineSetupRun(runId, c.var.auth.organization.localOrganizationId);
      if (!run) {
        return notFoundResponse(c, "engine_setup_run_not_found", "Engine setup run was not found");
      }
      if (run.status !== "ready") {
        return apiErrorResponse(
          c,
          409,
          "engine_setup_run_not_ready",
          "Suggestions can only be reviewed while the run is ready",
        );
      }

      const updated = await updateEngineSetupSuggestionStatuses({
        runId: run.id,
        suggestionIds: [...new Set(payload.suggestionIds)],
        status: payload.status,
      });
      return c.json({ suggestions: { updated } }, 200);
    })
    .post("/:runId/apply", validateRunParams, validateApplyBody, async (c) => {
      if (!canManageEngineSetup(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden", "Only workspace admins can apply engine setup");
      }
      const { runId } = c.req.valid("param");
      const payload = c.req.valid("json");
      const run = await findEngineSetupRun(runId, c.var.auth.organization.localOrganizationId);
      if (!run) {
        return notFoundResponse(c, "engine_setup_run_not_found", "Engine setup run was not found");
      }

      const applied = await applyEngineSetup({
        auth: c.var.auth,
        run,
        glossaryId: payload.glossaryId ?? null,
      });
      if (isErr(applied)) {
        switch (applied.error.code) {
          case "engine_setup_run_not_ready":
            return apiErrorResponse(
              c,
              409,
              applied.error.code,
              "Only a run that is ready for review can be applied",
            );
          case "engine_setup_nothing_to_apply":
            return badRequestResponse(c, applied.error.code, "Accept at least one suggestion");
          case "glossary_not_found":
            return notFoundResponse(c, applied.error.code, "Glossary was not found");
          case "knowledge_memory_too_long":
            return badRequestResponse(
              c,
              applied.error.code,
              "Knowledge memory would exceed its size limit. Accept fewer rules.",
            );
          case "knowledge_memory_conflict":
            return apiErrorResponse(
              c,
              409,
              applied.error.code,
              "Knowledge memory changed while applying. Try again.",
            );
          default:
            return assertNever(applied.error);
        }
      }

      const { run: appliedRun, ...summary } = applied.value;
      return c.json({ engineSetupRun: toEngineSetupRunRecord(appliedRun), applied: summary }, 200);
    });
}
