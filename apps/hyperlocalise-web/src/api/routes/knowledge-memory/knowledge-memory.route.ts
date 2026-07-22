/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { Hono } from "hono";
import { validator } from "hono/validator";

import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { forbiddenResponse, validationErrorResponse } from "@/api/errors";
import {
  getKnowledgeMemoryForOrganization,
  upsertKnowledgeMemoryForOrganization,
} from "@/lib/knowledge-memory/knowledge-memory";
import { workspaceKnowledgeFlag } from "@/lib/flags/workspace-flags";
import { selectKnowledgeMemoryContext } from "@/lib/knowledge-memory/knowledge-memory-selection";

import {
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
