import { describe, expect, it } from "vite-plus/test";

import type { HyperlocaliseAgentRuntimeContext } from "@/lib/agent-runtime/context";

import {
  listAvailableSubagentTypes,
  resolveSubagentTypeForMode,
  SUBAGENT_REGISTRY,
} from "./registry";

function createRuntime(
  overrides: Partial<HyperlocaliseAgentRuntimeContext> = {},
): HyperlocaliseAgentRuntimeContext {
  return {
    surface: "slack",
    suggestedMode: "general",
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
    const runtime = createRuntime({ hasFileAttachments: true, suggestedMode: "translation" });
    expect(listAvailableSubagentTypes(runtime)).toContain("translation");
    expect(SUBAGENT_REGISTRY.translation.isAvailable(runtime)).toBe(true);
  });

  it("lists repository when a sandbox is available", () => {
    const runtime = createRuntime({
      suggestedMode: "repository",
      toolContext: {
        ...createRuntime().toolContext,
        sandboxId: "sbx_1",
      },
    });
    expect(listAvailableSubagentTypes(runtime)).toEqual(["repository"]);
    expect(resolveSubagentTypeForMode(runtime)).toBe("repository");
  });

  it("prefers translation mode when both specialists are available", () => {
    const runtime = createRuntime({
      suggestedMode: "translation",
      hasFileAttachments: true,
      toolContext: {
        ...createRuntime().toolContext,
        sandboxId: "sbx_1",
      },
    });
    expect(resolveSubagentTypeForMode(runtime)).toBe("translation");
  });
});
