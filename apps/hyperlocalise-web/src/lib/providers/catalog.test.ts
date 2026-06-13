import { describe, expect, it } from "vite-plus/test";

import { llmProviderCatalog } from "@/lib/providers/catalog";

describe("llmProviderCatalog", () => {
  it("uses Anthropic native model IDs for BYOK validation", () => {
    expect(llmProviderCatalog.anthropic.models).toEqual([
      "claude-sonnet-4-6",
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-haiku-4-5",
      "claude-sonnet-4-5",
      "claude-opus-4-5",
    ]);

    expect(llmProviderCatalog.anthropic.models).not.toContain("claude-sonnet-4.6");
  });
});
