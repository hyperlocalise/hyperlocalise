import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const sandboxMocks = vi.hoisted(() => {
  const output = vi.fn();
  const runCommand = vi.fn();
  const get = vi.fn();

  return { get, output, runCommand };
});

vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_API_KEY: "test-openai-api-key",
    FILE_STORAGE_PROVIDER: "vercel_blob",
    FILE_STORAGE_ACCESS: "private",
  },
}));

vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    get: sandboxMocks.get,
  },
}));

import {
  buildTempConfig,
  runSandboxCommand,
  userFacingFailureReason,
} from "@/lib/translation/sandbox-translation";

describe("sandbox command runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures combined output by default", async () => {
    sandboxMocks.output.mockResolvedValueOnce("stdout and stderr");
    sandboxMocks.runCommand.mockResolvedValueOnce({
      exitCode: 0,
      output: sandboxMocks.output,
    });
    sandboxMocks.get.mockResolvedValueOnce({
      runCommand: sandboxMocks.runCommand,
    });

    await expect(runSandboxCommand("sandbox_123", "echo", ["hello"])).resolves.toEqual({
      exitCode: 0,
      output: "stdout and stderr",
    });

    expect(sandboxMocks.output).toHaveBeenCalledWith("both");
  });

  it("can capture stdout only for machine-readable command output", async () => {
    sandboxMocks.output.mockResolvedValueOnce('{"hello":"world"}');
    sandboxMocks.runCommand.mockResolvedValueOnce({
      exitCode: 0,
      output: sandboxMocks.output,
    });
    sandboxMocks.get.mockResolvedValueOnce({
      runCommand: sandboxMocks.runCommand,
    });

    await expect(
      runSandboxCommand("sandbox_123", "bash", ["-c", "hl entries source.json"], {
        output: "stdout",
      }),
    ).resolves.toEqual({
      exitCode: 0,
      output: '{"hello":"world"}',
    });

    expect(sandboxMocks.output).toHaveBeenCalledWith("stdout");
  });
});

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

describe("sandbox translation failure reasons", () => {
  it("preserves glossary validation diagnostics for persisted job failures", () => {
    const diagnostics = {
      targetLocale: "fr-FR",
      failedTermCount: 1,
      failures: [
        {
          sourceTerm: "workspace",
          targetTerm: "espace de travail",
          forbidden: false,
          reason: "missing_preferred_term",
        },
      ],
    };
    const message = `glossary validation failed: ${JSON.stringify(diagnostics)}`;

    expect(userFacingFailureReason(new Error(message))).toBe(message);
  });
});
