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
import { Hono, type Context } from "hono";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";

type KnowledgeMemoryContext = Context<{ Variables: AuthVariables }>;

function knowledgeMemoryGoneResponse(c: KnowledgeMemoryContext) {
  return c.json(
    {
      error: "knowledge_memory_gone",
      message:
        "Typed guideline notes are retired. Manage guideline documents from the Knowledge page instead.",
    },
    410,
  );
}

/**
 * @deprecated Typed guideline notes are retired; guidelines are document records now.
 * Every endpoint on this router answers 410 Gone and points callers at documents.
 */
export function createKnowledgeMemoryRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => knowledgeMemoryGoneResponse(c))
    .post("/preview", async (c) => knowledgeMemoryGoneResponse(c))
    .get("/revisions", async (c) => knowledgeMemoryGoneResponse(c))
    .get("/revisions/:revisionId", async (c) => knowledgeMemoryGoneResponse(c))
    .post("/revisions/:revisionId/restore", async (c) => knowledgeMemoryGoneResponse(c))
    .put("/", async (c) => knowledgeMemoryGoneResponse(c));
}
