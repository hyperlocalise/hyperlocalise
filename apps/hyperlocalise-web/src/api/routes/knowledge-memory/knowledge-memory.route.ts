import { Hono } from "hono";
import { validator } from "hono/validator";

import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { forbiddenResponse, validationErrorResponse } from "@/api/errors";
import {
  getKnowledgeMemoryForOrganization,
  upsertKnowledgeMemoryForOrganization,
} from "@/lib/knowledge-memory/knowledge-memory";

import { updateKnowledgeMemoryBodySchema } from "./knowledge-memory.schema";

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

function canUpdateKnowledgeMemory(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "workspace:update");
}

export function createKnowledgeMemoryRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      const knowledgeMemory = await getKnowledgeMemoryForOrganization(
        c.var.auth.organization.localOrganizationId,
      );

      return c.json({ knowledgeMemory }, 200);
    })
    .put("/", validateUpdateKnowledgeMemoryBody, async (c) => {
      if (!canUpdateKnowledgeMemory(c.var.auth.membership.role)) {
        return forbiddenResponse(
          c,
          "forbidden",
          "Only workspace admins can update knowledge memory",
        );
      }

      const payload = c.req.valid("json");
      const knowledgeMemory = await upsertKnowledgeMemoryForOrganization({
        organizationId: c.var.auth.organization.localOrganizationId,
        updatedByUserId: c.var.auth.user.localUserId,
        content: payload.content,
      });

      return c.json({ knowledgeMemory }, 200);
    });
}
