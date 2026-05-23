import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  process.env.CI = "true";
});

vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_API_KEY: "test-openai-api-key",
    FILE_STORAGE_PROVIDER: "vercel_blob",
    FILE_STORAGE_ACCESS: "private",
  },
}));

import { mapHlCheckReportToProviderFindings } from "./map-hl-findings";
import { runHlCheckOnProviderContent } from "./run-hl-check";

const sandboxMocks = vi.hoisted(() => {
  const output = vi.fn();
  const runCommand = vi.fn();
  const writeFiles = vi.fn();
  const get = vi.fn();
  const create = vi.fn();
  const stop = vi.fn();

  return { create, get, output, runCommand, stop, writeFiles };
});

vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    create: sandboxMocks.create,
    get: sandboxMocks.get,
  },
}));

vi.mock("@/lib/translation/sandbox-translation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/translation/sandbox-translation")>();
  return {
    ...actual,
    createTranslationSandbox: vi.fn(async () => ({ sandboxId: "sandbox_qa_1" })),
    prepareSandbox: vi.fn(async () => undefined),
    stopTranslationSandbox: vi.fn(async () => undefined),
    runSandboxCommand: vi.fn(async (_sandboxId: string, command: string, args: string[]) => {
      if (command === "bash" && args[0] === "-lc" && args[1]?.includes("hl check")) {
        return { exitCode: 0, output: "" };
      }
      if (command === "cat") {
        return {
          exitCode: 0,
          output: JSON.stringify({
            checks: ["placeholder_mismatch"],
            findings: [
              {
                type: "placeholder_mismatch",
                severity: "error",
                locale: "fr",
                sourceFile: "content/en/strings.json",
                targetFile: "content/fr/strings.json",
                key: "greeting",
                message: "Placeholder mismatch",
              },
            ],
            summary: { total: 1 },
          }),
        };
      }
      return { exitCode: 0, output: "" };
    }),
  };
});

describe("hl check sandbox integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sandboxMocks.create.mockResolvedValue({ sandboxId: "sandbox_qa_1", stop: sandboxMocks.stop });
    sandboxMocks.get.mockResolvedValue({
      runCommand: sandboxMocks.runCommand,
      writeFiles: sandboxMocks.writeFiles,
      stop: sandboxMocks.stop,
    });
    sandboxMocks.writeFiles.mockResolvedValue(undefined);
    sandboxMocks.stop.mockResolvedValue(undefined);
  });

  it("runs hl check in a sandbox and maps findings", async () => {
    const result = await runHlCheckOnProviderContent({
      content: {
        externalJobId: "job-1",
        sourceLocale: "en",
        targetLocales: ["fr"],
        units: [
          {
            externalStringId: "1",
            key: "greeting",
            sourceText: "Hello {name}",
            translations: [{ locale: "fr", text: "Bonjour" }],
          },
        ],
      },
      targetLocales: ["fr"],
    });

    const findings = mapHlCheckReportToProviderFindings({
      report: result.report,
      manifest: result.keyManifest,
      sourceLocale: "en",
    });

    expect(findings.some((finding) => finding.checkType === "placeholder_mismatch")).toBe(true);
    const { stopTranslationSandbox } = await import("@/lib/translation/sandbox-translation");
    expect(stopTranslationSandbox).toHaveBeenCalledWith("sandbox_qa_1");
  });
});
