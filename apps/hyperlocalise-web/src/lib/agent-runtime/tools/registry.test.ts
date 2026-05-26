import { describe, expect, it } from "vite-plus/test";

import { buildTools } from "./registry";
import type { ToolContext } from "@/lib/tools/types";

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
    expect(tools.searchRepoFiles).toBeUndefined();
    expect(tools.createSyncJob).toBeUndefined();
    expect(tools.createAssetManagementJob).toBeUndefined();
  });

  it("does not expose repo write tools in read-only mode", () => {
    const tools = buildTools(createToolContext({ sandboxId: "sbx_1", workMode: "read_only" }));

    expect(tools.searchRepoFiles).toBeDefined();
    expect(tools.applyHyperlocaliseFixes).toBeUndefined();
  });
});
