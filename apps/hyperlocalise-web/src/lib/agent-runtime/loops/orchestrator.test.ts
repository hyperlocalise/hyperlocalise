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
      suggestedIntents: ["repository"],
      suggestedMode: "repository",
      availableSubagents: ["repository"],
      preferredSubagents: ["repository"],
    });

    expect(instructions).toContain("Repository context handoff");
    expect(instructions).toContain("localization context exploration");
    expect(instructions).toContain("source text");
    expect(instructions).toContain("placeholder meanings");
    expect(instructions).toContain("Do not use repository context for broad architecture");
  });

  it("instructs sequential delegation when multiple intents are active", () => {
    const instructions = buildOrchestratorInstructions({
      surface: "slack",
      projectId: null,
      suggestedIntents: ["translation", "repository"],
      suggestedMode: "general",
      availableSubagents: ["repository", "translation"],
      preferredSubagents: ["repository", "translation"],
    });

    expect(instructions).toContain("Active intents");
    expect(instructions).toContain("`translation`");
    expect(instructions).toContain("`repository`");
    expect(instructions).toContain("`repository` → `translation`");
    expect(instructions).toContain("Run every agent");
    expect(instructions).toContain("complete repository context collection before translation");
  });
});
