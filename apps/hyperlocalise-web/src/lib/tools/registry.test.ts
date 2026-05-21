import { describe, expect, it } from "vite-plus/test";

import { buildTools } from "./registry";
import type { ToolContext } from "./types";

function createToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    conversationId: "conversation_1",
    organizationId: "org_1",
    membershipRole: "member",
    projectId: "project_1",
    db: {} as ToolContext["db"],
    ...overrides,
  };
}

describe("buildTools", () => {
  it("omits repo/TMS write tools in read-only mode", () => {
    const tools = buildTools(createToolContext({ workMode: "read_only" }));

    expect(tools.applyHyperlocaliseFixes).toBeUndefined();
    expect(tools.commitChanges).toBeUndefined();
    expect(tools.pushToBranch).toBeUndefined();
    expect(tools.uploadSources).toBeUndefined();
    expect(tools.listProjects).toBeDefined();
  });

  it("includes repo/TMS write tools outside read-only mode", () => {
    const tools = buildTools(
      createToolContext({
        workMode: "approval_required",
        repoTmsSource: "slack",
        actor: { sourceUserId: "U1", role: "admin" },
      }),
    );

    expect(tools.applyHyperlocaliseFixes).toBeDefined();
    expect(tools.commitChanges).toBeDefined();
    expect(tools.pushToBranch).toBeDefined();
    expect(tools.uploadSources).toBeDefined();
  });
});
