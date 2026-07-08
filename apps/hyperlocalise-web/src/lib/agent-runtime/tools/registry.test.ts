import { describe, expect, it } from "vite-plus/test";

import { buildTools } from "./registry";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";

function createToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    conversationId: "conversation_1",
    organizationId: "org_1",
    localUserId: "user_1",
    membershipRole: "member",
    projectId: "project_1",
    db: {} as ToolContext["db"],
    ...overrides,
  };
}

describe("agent-runtime tool registry", () => {
  it("exposes translation tools without a workspace", () => {
    const tools = buildTools(createToolContext());

    expect(tools.createTranslationJob).toBeDefined();
    expect(tools.grep).toBeUndefined();
    expect(tools.todoWrite).toBeDefined();
    expect(tools.createSyncJob).toBeUndefined();
  });

  it("exposes workspace tools alongside translation tools when a sandbox is available", () => {
    const tools = buildTools(createToolContext({ sandboxId: "sbx_1", workMode: "read_only" }));

    expect(tools.createTranslationJob).toBeDefined();
    expect(tools.grep).toBeDefined();
    expect(tools.fuzzySearch).toBeDefined();
    expect(tools.read).toBeDefined();
    expect(tools.glob).toBeDefined();
    expect(tools.detectRepoConfig).toBeDefined();
    expect(tools.gitHistory).toBeDefined();
    expect(tools.bash).toBeDefined();
    expect(tools.todoWrite).toBeDefined();
    expect(tools.applyHyperlocaliseFixes).toBeUndefined();
  });
});
