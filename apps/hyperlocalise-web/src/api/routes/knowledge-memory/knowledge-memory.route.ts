import { Hono, type Context } from "hono";
import { validator } from "hono/validator";

import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import {
  apiErrorResponse,
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  validationErrorResponse,
} from "@/api/errors";
import { workspaceKnowledgeFlag } from "@/lib/flags/workspace-flags";
import {
  commitKnowledgeMemoryForOrganization,
  getKnowledgeMemoryForOrganization,
} from "@/lib/knowledge-memory/knowledge-memory";
import {
  getKnowledgeMemoryRevisionForOrganization,
  listKnowledgeMemoryRevisions,
  restoreKnowledgeMemoryRevisionForOrganization,
} from "@/lib/knowledge-memory/knowledge-memory-revisions";
import { selectKnowledgeMemoryContext } from "@/lib/knowledge-memory/knowledge-memory-selection";
import type { KnowledgeMemoryRecord } from "@/lib/knowledge-memory/knowledge-memory.types";
import { isErr } from "@/lib/primitives/result/results";

import {
  knowledgeMemoryRevisionListQuerySchema,
  knowledgeMemoryRevisionParamsSchema,
  previewKnowledgeMemoryBodySchema,
  updateKnowledgeMemoryBodySchema,
} from "./knowledge-memory.schema";

const validateUpdateKnowledgeMemoryBody = validator("json", (value, c) => {
  const parsed = updateKnowledgeMemoryBodySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_knowledge_memory_payload",
      "Knowledge memory payload is invalid",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validatePreviewKnowledgeMemoryBody = validator("json", (value, c) => {
  const parsed = previewKnowledgeMemoryBodySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_knowledge_memory_preview_payload",
      "Knowledge memory preview payload is invalid",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateKnowledgeMemoryRevisionListQuery = validator("query", (value, c) => {
  const parsed = knowledgeMemoryRevisionListQuerySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_knowledge_memory_revision_query",
      "Knowledge memory revision query is invalid",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateKnowledgeMemoryRevisionParams = validator("param", (value, c) => {
  const parsed = knowledgeMemoryRevisionParamsSchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_knowledge_memory_revision_params",
      "Knowledge memory revision is invalid",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

function canUpdateKnowledgeMemory(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "workspace:update");
}

async function isKnowledgeMemoryFeatureEnabled(auth: AuthVariables["auth"]) {
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

function formatKnowledgeMemoryEtag(revisionId: string | null) {
  return `"${revisionId ?? "0"}"`;
}

type ParsedKnowledgeMemoryPrecondition =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "valid"; expectedRevisionId: string | null };

function parseKnowledgeMemoryIfMatch(value: string | undefined): ParsedKnowledgeMemoryPrecondition {
  if (value === undefined) {
    return { kind: "missing" };
  }

  const match = /^"([^"]+)"$/u.exec(value.trim());
  if (!match) {
    return { kind: "invalid" };
  }

  const token = match[1];
  if (token === "0") {
    return { kind: "valid", expectedRevisionId: null };
  }

  return knowledgeMemoryRevisionParamsSchema.shape.revisionId.safeParse(token).success
    ? { kind: "valid", expectedRevisionId: token }
    : { kind: "invalid" };
}

type KnowledgeMemoryContext = Context<{ Variables: AuthVariables }>;

function setKnowledgeMemoryEtag(c: KnowledgeMemoryContext, knowledgeMemory: KnowledgeMemoryRecord) {
  c.header("ETag", formatKnowledgeMemoryEtag(knowledgeMemory.revisionId));
}

function validateKnowledgeMemoryPrecondition(c: KnowledgeMemoryContext) {
  const precondition = parseKnowledgeMemoryIfMatch(c.req.header("If-Match"));
  if (precondition.kind === "missing") {
    return apiErrorResponse(
      c,
      428,
      "knowledge_memory_precondition_required",
      "Reload Knowledge Memory before committing changes",
    );
  }
  if (precondition.kind === "invalid") {
    return badRequestResponse(
      c,
      "invalid_knowledge_memory_precondition",
      "If-Match must contain the current Knowledge Memory ETag",
    );
  }
  return precondition;
}

function knowledgeMemoryPreconditionFailedResponse(
  c: KnowledgeMemoryContext,
  current: KnowledgeMemoryRecord,
) {
  setKnowledgeMemoryEtag(c, current);
  return apiErrorResponse(
    c,
    412,
    "knowledge_memory_precondition_failed",
    "Knowledge Memory changed after it was loaded",
    { knowledgeMemory: current },
  );
}

export function createKnowledgeMemoryRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .use("*", async (c, next) => {
      const enabled = await isKnowledgeMemoryFeatureEnabled(c.var.auth);
      if (!enabled) {
        return forbiddenResponse(
          c,
          "feature_unavailable",
          "Workspace knowledge is not enabled for this organization",
        );
      }

      await next();
    })
    .get("/", async (c) => {
      const knowledgeMemory = await getKnowledgeMemoryForOrganization(
        c.var.auth.organization.localOrganizationId,
      );
      setKnowledgeMemoryEtag(c, knowledgeMemory);

      return c.json({ knowledgeMemory }, 200);
    })
    .post("/preview", validatePreviewKnowledgeMemoryBody, async (c) => {
      const payload = c.req.valid("json");
      const knowledgeMemory = await getKnowledgeMemoryForOrganization(
        c.var.auth.organization.localOrganizationId,
      );
      const memoryPreview = selectKnowledgeMemoryContext({
        content: knowledgeMemory.content,
        targetLocale: payload.targetLocale,
        targetLocales: payload.targetLocales,
        sourceLocale: payload.sourceLocale,
        sourceText: payload.sourceText,
        context: payload.context,
        key: payload.key,
        path: payload.path,
        metadata: payload.metadata,
        maxChars: payload.maxChars,
      });

      return c.json({ memoryPreview }, 200);
    })
    .get("/revisions", validateKnowledgeMemoryRevisionListQuery, async (c) => {
      const query = c.req.valid("query");
      const result = await listKnowledgeMemoryRevisions({
        organizationId: c.var.auth.organization.localOrganizationId,
        limit: query.limit,
        cursor: query.cursor,
      });

      return c.json(result, 200);
    })
    .get("/revisions/:revisionId", validateKnowledgeMemoryRevisionParams, async (c) => {
      const { revisionId } = c.req.valid("param");
      const result = await getKnowledgeMemoryRevisionForOrganization({
        organizationId: c.var.auth.organization.localOrganizationId,
        revisionId,
      });

      if (!result) {
        return notFoundResponse(
          c,
          "knowledge_memory_revision_not_found",
          "Knowledge Memory revision was not found",
        );
      }

      return c.json(result, 200);
    })
    .post("/revisions/:revisionId/restore", validateKnowledgeMemoryRevisionParams, async (c) => {
      if (!canUpdateKnowledgeMemory(c.var.auth.membership.role)) {
        return forbiddenResponse(
          c,
          "forbidden",
          "Only workspace admins can restore knowledge memory",
        );
      }

      const precondition = validateKnowledgeMemoryPrecondition(c);
      if (precondition instanceof Response) {
        return precondition;
      }

      const { revisionId } = c.req.valid("param");
      const result = await restoreKnowledgeMemoryRevisionForOrganization({
        organizationId: c.var.auth.organization.localOrganizationId,
        revisionId,
        restoredByUserId: c.var.auth.user.localUserId,
        expectedRevisionId: precondition.expectedRevisionId,
      });

      if (isErr(result)) {
        if (result.error.code === "revision_not_found") {
          return notFoundResponse(
            c,
            "knowledge_memory_revision_not_found",
            "Knowledge Memory revision was not found",
          );
        }
        return knowledgeMemoryPreconditionFailedResponse(c, result.error.current);
      }

      setKnowledgeMemoryEtag(c, result.value.knowledgeMemory);
      return c.json({ knowledgeMemory: result.value.knowledgeMemory }, 200);
    })
    .put("/", validateUpdateKnowledgeMemoryBody, async (c) => {
      if (!canUpdateKnowledgeMemory(c.var.auth.membership.role)) {
        return forbiddenResponse(
          c,
          "forbidden",
          "Only workspace admins can update knowledge memory",
        );
      }

      const precondition = validateKnowledgeMemoryPrecondition(c);
      if (precondition instanceof Response) {
        return precondition;
      }

      const payload = c.req.valid("json");
      const result = await commitKnowledgeMemoryForOrganization({
        organizationId: c.var.auth.organization.localOrganizationId,
        updatedByUserId: c.var.auth.user.localUserId,
        content: payload.content,
        summary: payload.summary,
        expectedRevisionId: precondition.expectedRevisionId,
      });

      if (isErr(result)) {
        return knowledgeMemoryPreconditionFailedResponse(c, result.error.current);
      }

      setKnowledgeMemoryEtag(c, result.value.knowledgeMemory);
      return c.json({ knowledgeMemory: result.value.knowledgeMemory }, 200);
    });
}
