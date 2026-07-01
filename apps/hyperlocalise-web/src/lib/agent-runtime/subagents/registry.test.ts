import { describe, expect, it } from "vite-plus/test";

import type { HyperlocaliseAgentRuntimeContext } from "@/lib/agent-runtime/context";

import {
  listAvailableSubagentTypes,
  resolvePreferredSubagentOrder,
  resolveSubagentTypeForMode,
  SUBAGENT_REGISTRY,
} from "./registry";

function createRuntime(
  overrides: Partial<HyperlocaliseAgentRuntimeContext> = {},
): HyperlocaliseAgentRuntimeContext {
  return {
    surface: "slack",
    hasFileAttachments: false,
    toolContext: {
      conversationId: "conv_1",
      organizationId: "org_1",
      localUserId: "user_1",
      membershipRole: "member",
      projectId: null,
      db: {} as never,
    },
    ...overrides,
  };
}

describe("subagent registry", () => {
  it("lists translation when files are attached", () => {
    const runtime = createRuntime({
      hasFileAttachments: true,
    });
    expect(listAvailableSubagentTypes(runtime)).toContain("translation");
    expect(SUBAGENT_REGISTRY.translation.isAvailable(runtime)).toBe(true);
  });

  it("lists repository when a sandbox is available", () => {
    const runtime = createRuntime({
      toolContext: {
        ...createRuntime().toolContext,
        sandboxId: "sbx_1",
      },
    });
    expect(listAvailableSubagentTypes(runtime)).toEqual(["repository"]);
    expect(resolveSubagentTypeForMode(runtime)).toBe("repository");
  });

  it("orders repository before translation when both are available", () => {
    const runtime = createRuntime({
      hasFileAttachments: true,
      toolContext: {
        ...createRuntime().toolContext,
        sandboxId: "sbx_1",
      },
    });
    expect(listAvailableSubagentTypes(runtime)).toEqual(["translation", "repository"]);
    expect(resolvePreferredSubagentOrder(runtime)).toEqual(["repository", "translation"]);
    expect(resolveSubagentTypeForMode(runtime)).toBe("repository");
  });
});
