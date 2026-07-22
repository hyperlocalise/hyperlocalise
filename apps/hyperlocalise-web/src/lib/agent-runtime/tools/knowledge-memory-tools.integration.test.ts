import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { db, schema } from "@/lib/database";
import {
  commitKnowledgeMemoryForOrganization,
  getKnowledgeMemoryForOrganization,
} from "@/lib/knowledge-memory/knowledge-memory";
import { isOk } from "@/lib/primitives/result/results";

import {
  createGetKnowledgeMemoryTool,
  createUpdateKnowledgeMemoryTool,
} from "./knowledge-memory-tools";

const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

async function executeTool(tool: unknown, input: unknown) {
  const execute = (tool as { execute?: (value: unknown, options: unknown) => unknown }).execute;
  if (!execute) {
    throw new Error("tool is not executable");
  }

  return execute(input, { toolCallId: "tool_call_1", messages: [] });
}

describe("Knowledge Memory agent tool integration", () => {
  it("creates a scoped recoverable revision and preserves unrelated markdown", async () => {
    const stored = await fixture.createLocalWorkosIdentity();
    const otherStored = await fixture.createLocalWorkosIdentity();
    const organizationId = stored.organization.id;
    const userId = stored.user.id;
    const otherContent = "# Other organization\n\nKeep this memory isolated.";
    const initialContent = [
      "# Memory.md",
      "",
      "## Voice",
      "Use a friendly voice.",
      "",
      "## Legal",
      "Preserve approved legal text exactly.",
    ].join("\n");
    const initial = await commitKnowledgeMemoryForOrganization({
      organizationId,
      updatedByUserId: userId,
      expectedRevisionId: null,
      content: initialContent,
      summary: "Initial guidance",
    });
    expect(isOk(initial)).toBe(true);
    if (!isOk(initial)) {
      return;
    }
    const otherInitial = await commitKnowledgeMemoryForOrganization({
      organizationId: otherStored.organization.id,
      updatedByUserId: otherStored.user.id,
      expectedRevisionId: null,
      content: otherContent,
      summary: "Other organization guidance",
    });
    expect(isOk(otherInitial)).toBe(true);
    if (!isOk(otherInitial)) {
      return;
    }

    const toolContext: ToolContext = {
      conversationId: "conversation_1",
      organizationId,
      localUserId: userId,
      membershipRole: "admin",
      projectId: null,
      db,
      knowledgeMemoryEnabled: true,
    };
    const read = (await executeTool(createGetKnowledgeMemoryTool(toolContext), {})) as {
      success: true;
      knowledgeMemory: { revisionId: string };
    };
    const updated = await executeTool(createUpdateKnowledgeMemoryTool(toolContext), {
      expectedRevisionId: read.knowledgeMemory.revisionId,
      summary: "Refine voice guidance",
      edits: [
        {
          operation: "replace",
          matchText: "Use a friendly voice.",
          replacementText: "Use a concise, friendly voice.",
        },
      ],
    });

    expect(updated).toMatchObject({ success: true, changed: true, version: 2 });
    expect(await getKnowledgeMemoryForOrganization(organizationId)).toMatchObject({
      version: 2,
      content: [
        "# Memory.md",
        "",
        "## Voice",
        "Use a concise, friendly voice.",
        "",
        "## Legal",
        "Preserve approved legal text exactly.",
      ].join("\n"),
      summary: "Refine voice guidance",
      updatedByUserId: userId,
    });
    expect(await getKnowledgeMemoryForOrganization(otherStored.organization.id)).toMatchObject({
      version: 1,
      content: otherContent,
      summary: "Other organization guidance",
      updatedByUserId: otherStored.user.id,
    });

    const revisions = await db
      .select({
        id: schema.knowledgeMemoryRevisions.id,
        version: schema.knowledgeMemoryRevisions.version,
        content: schema.knowledgeMemoryRevisions.content,
      })
      .from(schema.knowledgeMemoryRevisions)
      .where(eq(schema.knowledgeMemoryRevisions.organizationId, organizationId));
    expect(revisions).toEqual([
      {
        id: initial.value.knowledgeMemory.revisionId,
        version: 1,
        content: initialContent,
      },
    ]);
  });
});
