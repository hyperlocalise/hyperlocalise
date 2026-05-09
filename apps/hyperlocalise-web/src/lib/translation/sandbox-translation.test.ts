import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_API_KEY: "test-openai-api-key",
    FILE_STORAGE_PROVIDER: "vercel_blob",
    FILE_STORAGE_ACCESS: "private",
  },
}));

import { buildTempConfig } from "@/lib/translation/sandbox-translation";

describe("sandbox translation temporary config", () => {
  it("augments file translation system prompt with project context, job context, and glossary", () => {
    const config = buildTempConfig(
      "source.json",
      "target.json",
      "en-US",
      "fr-FR",
      "Keep it formal.",
      {
        projectName: "Marketing Site",
        projectTranslationContext: "Use concise product-marketing copy.",
        jobContext: "Homepage launch banner.",
        glossaryTerms: [
          {
            sourceTerm: "workspace",
            targetTerm: "espace de travail",
            targetLocale: "fr-FR",
            description: "Approved product term.",
          },
        ],
      },
    );

    expect(config).toContain("system_prompt:");
    expect(config).toContain("Project: Marketing Site");
    expect(config).toContain("Project translation context: Use concise product-marketing copy.");
    expect(config).toContain("Job context: Homepage launch banner.");
    expect(config).toContain("User style instructions: Keep it formal.");
    expect(config).toContain("workspace -> espace de travail (fr-FR)");
    expect(config).toContain("Approved product term.");
  });

  it("keeps context optional for email-style sandbox translations", () => {
    const config = buildTempConfig("source.json", "target.json", "en-US", "fr-FR", null);

    expect(config).toContain("system_prompt:");
    expect(config).not.toContain("Project translation context:");
    expect(config).not.toContain("Glossary terms:");
  });
});
