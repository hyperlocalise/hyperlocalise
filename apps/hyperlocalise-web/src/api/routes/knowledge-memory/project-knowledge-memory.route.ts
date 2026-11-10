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

type ProjectKnowledgeMemoryContext = Context<{ Variables: AuthVariables }>;

function projectKnowledgeMemoryGoneResponse(c: ProjectKnowledgeMemoryContext) {
  return c.json(
    {
      error: "knowledge_memory_gone",
      message:
        "Typed project guideline notes are retired. Manage project guideline documents from the Knowledge page instead.",
    },
    410,
  );
}

/**
 * @deprecated Typed project guideline notes are retired; guidelines are document records now.
 * Every endpoint on this router answers 410 Gone and points callers at documents.
 */
export function createProjectKnowledgeMemoryRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => projectKnowledgeMemoryGoneResponse(c))
    .post("/preview", async (c) => projectKnowledgeMemoryGoneResponse(c))
    .get("/revisions", async (c) => projectKnowledgeMemoryGoneResponse(c))
    .get("/revisions/:revisionId", async (c) => projectKnowledgeMemoryGoneResponse(c))
    .post("/revisions/:revisionId/restore", async (c) => projectKnowledgeMemoryGoneResponse(c))
    .put("/", async (c) => projectKnowledgeMemoryGoneResponse(c));
}
