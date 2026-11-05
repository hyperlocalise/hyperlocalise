/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  prepareSandbox: vi.fn(),
  runSandboxCommand: vi.fn(),
}));

vi.mock("@/lib/translation/sandbox", () => ({
  prepareSandbox: (...args: unknown[]) => mocks.prepareSandbox(...args),
  runSandboxCommand: (...args: unknown[]) => mocks.runSandboxCommand(...args),
}));

import {
  discoverI18nConfigInSandbox,
  loadI18nConfigJsonFromSandbox,
  parseI18nConfigText,
} from "./github-repository-automation-i18n-config";

const FILES = [{ from: "locales/[locale].json", to: "locales/[locale].json" }];

/** A sandbox whose repository holds these files, answering the commands the reader runs. */
function sandboxWithFiles(files: Record<string, string>) {
  mocks.runSandboxCommand.mockImplementation(
    async (_id: string, command: string, args: string[]) => {
      if (command === "bash") {
        return { exitCode: 0, output: Object.keys(files).join("\0") };
      }
      if (command === "test") {
        return { exitCode: args[1]! in files ? 0 : 1, output: "" };
      }
      if (command === "cat") {
        const content = files[args[0]!];
        return content === undefined
          ? { exitCode: 1, output: "" }
          : { exitCode: 0, output: content };
      }
      throw new Error(`unexpected command ${command}`);
    },
  );
}

beforeEach(() => {
  mocks.prepareSandbox.mockReset();
  mocks.runSandboxCommand.mockReset();
});

describe("parseI18nConfigText", () => {
  it("reads YAML as the CLI does, with shared blocks merged in", () => {
    const config = parseI18nConfigText(
      [
        "defaults: &files",
        "  files:",
        "    - from: locales/[locale].json",
        "      to: locales/[locale].json",
        "locales:",
        "  source: en",
        "  targets: &targets [no, fr]",
        "buckets:",
        "  json:",
        "    <<: *files",
        "groups:",
        "  web:",
        "    targets: *targets",
      ].join("\n"),
      "i18n.yml",
    );

    expect(config).toMatchObject({
      locales: { source: "en", targets: ["no", "fr"] },
      buckets: { json: { files: FILES } },
      groups: { web: { targets: ["no", "fr"] } },
    });
    expect(config?.buckets).not.toHaveProperty("json.<<");
  });

  it("reads only the first YAML document, as the CLI does", () => {
    expect(
      parseI18nConfigText("locales:\n  source: en\n---\nlocales:\n  source: de\n", "i18n.yml"),
    ).toEqual({ locales: { source: "en" } });
  });

  it("refuses YAML with a key given twice, as the CLI does", () => {
    expect(parseI18nConfigText("locales:\n  source: en\n  source: fr\n", "i18n.yml")).toBeNull();
  });

  it("refuses YAML that is not a config object", () => {
    expect(parseI18nConfigText("", "i18n.yml")).toBeNull();
    expect(parseI18nConfigText("- en\n- fr\n", "i18n.yml")).toBeNull();
    expect(parseI18nConfigText("locales: [\n", "i18n.yml")).toBeNull();
  });

  it("reads JSONC with comments and trailing commas", () => {
    expect(
      parseI18nConfigText('{\n  // source\n  "locales": {"source": "en",},\n}\n', "i18n.jsonc"),
    ).toEqual({ locales: { source: "en" } });
  });
});

describe("reading the config in the sandbox", () => {
  const yamlConfig = [
    "locales:",
    "  source: en",
    "  targets: [fr]",
    "buckets:",
    "  json:",
    "    files:",
    "      - from: locales/[locale].json",
    "        to: locales/[locale].json",
  ].join("\n");

  it("finds an i18n.yml without any YAML tool in the sandbox", async () => {
    sandboxWithFiles({ "i18n.yml": yamlConfig });

    const discovered = await discoverI18nConfigInSandbox("sandbox-1");

    expect(discovered).toEqual({
      configPath: "i18n.yml",
      patterns: expect.objectContaining({
        targetPatterns: expect.arrayContaining(["locales/[locale].json"]),
      }),
    });
    expect(await loadI18nConfigJsonFromSandbox("sandbox-1", "i18n.yml")).toMatchObject({
      locales: { source: "en", targets: ["fr"] },
    });
    const commands = mocks.runSandboxCommand.mock.calls.map((call) => [call[1], call[2]].join(" "));
    expect(commands.some((command) => command.includes("yq"))).toBe(false);
  });

  it("falls back to i18n.jsonc when i18n.yml cannot be read", async () => {
    sandboxWithFiles({
      "i18n.yml": "locales: [\n",
      "i18n.jsonc":
        '{"buckets": {"json": {"files": [{"from": "a/[locale].json", "to": "a/[locale].json"}]}}}',
    });

    const discovered = await discoverI18nConfigInSandbox("sandbox-1");

    expect(discovered?.configPath).toBe("i18n.jsonc");
  });
});
