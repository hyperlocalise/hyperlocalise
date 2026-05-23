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

const createTranslationSandboxMock = vi.fn();
const prepareSandboxMock = vi.fn();
const stopTranslationSandboxMock = vi.fn();
const runSandboxCommandMock = vi.fn();
const writeFilesToSandboxMock = vi.fn();

vi.mock("@/lib/translation/sandbox-translation", () => ({
  createTranslationSandbox: (...args: unknown[]) => createTranslationSandboxMock(...args),
  prepareSandbox: (...args: unknown[]) => prepareSandboxMock(...args),
  stopTranslationSandbox: (...args: unknown[]) => stopTranslationSandboxMock(...args),
  runSandboxCommand: (...args: unknown[]) => runSandboxCommandMock(...args),
  writeFilesToSandbox: (...args: unknown[]) => writeFilesToSandboxMock(...args),
}));

import { runHlCheckOnProviderContentInSandbox } from "./sandbox-hl-check";

describe("runHlCheckOnProviderContentInSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTranslationSandboxMock.mockResolvedValue({ sandboxId: "sandbox_qa_1" });
    prepareSandboxMock.mockResolvedValue(undefined);
    stopTranslationSandboxMock.mockResolvedValue(undefined);
    writeFilesToSandboxMock.mockResolvedValue(undefined);
    runSandboxCommandMock.mockImplementation(async (_sandboxId, command, args) => {
      if (command === "bash") {
        return { exitCode: 0, output: "" };
      }
      if (command === "cat") {
        return {
          exitCode: 0,
          output: JSON.stringify({ checks: [], findings: [], summary: { total: 0 } }),
        };
      }
      return { exitCode: 0, output: args.join(" ") };
    });
  });

  it("creates a sandbox, runs hl check, and stops the sandbox", async () => {
    await runHlCheckOnProviderContentInSandbox({
      content: {
        externalJobId: "job-1",
        sourceLocale: "en",
        targetLocales: ["fr"],
        units: [
          {
            externalStringId: "1",
            key: "greeting",
            sourceText: "Hello",
            translations: [{ locale: "fr", text: "Bonjour" }],
          },
        ],
      },
      targetLocales: ["fr"],
    });

    expect(createTranslationSandboxMock).toHaveBeenCalled();
    expect(prepareSandboxMock).toHaveBeenCalledWith("sandbox_qa_1");
    expect(writeFilesToSandboxMock).toHaveBeenCalled();
    expect(runSandboxCommandMock).toHaveBeenCalled();
    expect(stopTranslationSandboxMock).toHaveBeenCalledWith("sandbox_qa_1");
  });

  it("stops the sandbox when hl check fails", async () => {
    runSandboxCommandMock.mockImplementationOnce(async () => ({
      exitCode: 1,
      output: "hl check exploded",
    }));

    await expect(
      runHlCheckOnProviderContentInSandbox({
        content: {
          externalJobId: "job-1",
          targetLocales: ["fr"],
          units: [],
        },
        targetLocales: ["fr"],
      }),
    ).rejects.toThrow("hl check failed");

    expect(stopTranslationSandboxMock).toHaveBeenCalledWith("sandbox_qa_1");
  });

  it("stops the sandbox when the hl check report is invalid JSON", async () => {
    runSandboxCommandMock.mockImplementation(async (_sandboxId, command) => {
      if (command === "bash") {
        return { exitCode: 0, output: "" };
      }
      if (command === "cat") {
        return { exitCode: 0, output: "not-json" };
      }
      return { exitCode: 0, output: "" };
    });

    await expect(
      runHlCheckOnProviderContentInSandbox({
        content: {
          externalJobId: "job-1",
          targetLocales: ["fr"],
          units: [],
        },
        targetLocales: ["fr"],
      }),
    ).rejects.toThrow("hl check report is not valid JSON");

    expect(stopTranslationSandboxMock).toHaveBeenCalledWith("sandbox_qa_1");
  });
});
