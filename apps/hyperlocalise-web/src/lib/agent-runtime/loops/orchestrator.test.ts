import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => "mock-model"),
}));

vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_API_KEY: "test-openai-key",
  },
}));

import { buildOrchestratorInstructions } from "./orchestrator";

describe("conversation orchestrator", () => {
  it("frames repository delegation as localization context exploration", () => {
    const instructions = buildOrchestratorInstructions({
      surface: "web",
      projectId: null,
      suggestedMode: "repository",
      availableSubagents: ["repository"],
      preferredSubagent: "repository",
    });

    expect(instructions).toContain("Repository context handoff");
    expect(instructions).toContain("localization context exploration");
    expect(instructions).toContain("source text");
    expect(instructions).toContain("placeholder meanings");
    expect(instructions).toContain("Do not use repository context for broad architecture");
  });
});
