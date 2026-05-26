import { describe, expect, it } from "vite-plus/test";
import { Bash, defineCommand, InMemoryFs } from "just-bash";
import { z } from "zod";

import {
  buildHlArgs,
  createDetectRepoConfigTool,
  createReadRepoFileTool,
  createRepoGitStateTool,
  createRunHyperlocaliseCliTool,
  createSearchRepoFilesTool,
  redact,
  type I18NConfigSummary,
  type RepoSearchMatch,
  type RepoToolContext,
} from "./repo-read-tools";

function createTestContext(files: Record<string, string> = {}): RepoToolContext {
  const fs = new InMemoryFs(files);
  const bash = new Bash({ fs, cwd: "/home/user/project" });
  return { bash };
}

const toolCallInfo = { toolCallId: "test-tool-call", messages: [] };

describe("redact", () => {
  it("redacts env var lines", () => {
    const input = "OPENAI_API_KEY=sk-12345\nPATH=/usr/bin";
    expect(redact(input)).toBe("OPENAI_API_KEY=***REDACTED***\nPATH=/usr/bin");
  });

  it("redacts token key=value patterns", () => {
    expect(redact("api_token=abcdefghijklmnopqrstuvwxyz12345")).toBe("api_token=***REDACTED***");
  });

  it("redacts bearer tokens", () => {
    expect(redact("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")).toBe(
      "Authorization: Bearer ***REDACTED***",
    );
  });

  it("leaves safe text unchanged", () => {
    expect(redact("hello world\nfoo=bar")).toBe("hello world\nfoo=bar");
  });

  it("handles empty input", () => {
    expect(redact("")).toBe("");
  });
});

describe("createReadRepoFileTool", () => {
  it("reads a file", async () => {
    const ctx = createTestContext({ "/home/user/project/readme.md": "hello world" });
    const t = createReadRepoFileTool(ctx);
    expect(t.execute).toBeDefined();
    const result = await t.execute!({ path: "readme.md" }, toolCallInfo);
    expect(result).toMatchObject({ success: true, content: "hello world", truncated: false });
  });

  it("returns error for missing file", async () => {
    const ctx = createTestContext();
    const t = createReadRepoFileTool(ctx);
    const result = await t.execute!({ path: "missing.txt" }, toolCallInfo);
    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toBeTruthy();
  });

  it("truncates when max bytes exceeded", async () => {
    const content = "a".repeat(1000);
    const ctx = createTestContext({ "/home/user/project/big.txt": content });
    const t = createReadRepoFileTool(ctx);
    const result = await t.execute!({ path: "big.txt", maxBytes: 100 }, toolCallInfo);
    expect(result).toMatchObject({ success: true, truncated: true });
    expect((result as { content: string }).content.length).toBeLessThan(200);
  });

  it("reads with offset", async () => {
    const ctx = createTestContext({ "/home/user/project/readme.md": "hello world" });
    const t = createReadRepoFileTool(ctx);
    const result = await t.execute!({ path: "readme.md", offset: 6 }, toolCallInfo);
    expect(result).toMatchObject({ success: true, content: "world" });
  });

  it("redacts secrets in file content", async () => {
    const ctx = createTestContext({
      "/home/user/project/.env": "OPENAI_API_KEY=sk-12345\ntoken=abcdefghijklmnopqrstuvwxyz12345",
    });
    const t = createReadRepoFileTool(ctx);
    const result = await t.execute!({ path: ".env" }, toolCallInfo);
    const content = (result as { content: string }).content;
    expect(content).toContain("OPENAI_API_KEY=***REDACTED***");
    expect(content).toContain("token=***REDACTED***");
    expect(content).not.toContain("abcdefghijklmnopqrstuvwxyz12345");
  });
});

describe("createSearchRepoFilesTool", () => {
  it("finds matches", async () => {
    const ctx = createTestContext({
      "/home/user/project/a.go": "package main\n\nfunc main() {}\n",
      "/home/user/project/b.go": "package test\n\nfunc helper() {}\n",
    });
    const t = createSearchRepoFilesTool(ctx);
    const result = await t.execute!({ pattern: "func main" }, toolCallInfo);
    expect(result).toMatchObject({ success: true, truncated: false });
    expect((result as { matches: Array<{ path: string }> }).matches).toHaveLength(1);
    expect((result as { matches: Array<{ path: string }> }).matches[0].path).toBe("a.go");
  });

  it("returns empty for missing pattern", async () => {
    const ctx = createTestContext({
      "/home/user/project/a.go": "package main\n",
    });
    const t = createSearchRepoFilesTool(ctx);
    const result = await t.execute!({ pattern: "zzzzz" }, toolCallInfo);
    expect(result).toMatchObject({ success: true, matches: [] });
  });

  it("truncates at max results", async () => {
    const ctx = createTestContext({
      "/home/user/project/a.go": "func a() {}\n",
      "/home/user/project/b.go": "func b() {}\n",
    });
    const t = createSearchRepoFilesTool(ctx);
    const result = await t.execute!({ pattern: "func", maxResults: 1 }, toolCallInfo);
    expect(result).toMatchObject({ success: true, truncated: true });
    expect((result as { matches: unknown[] }).matches).toHaveLength(1);
  });

  it("redacts secrets in matched lines", async () => {
    const ctx = createTestContext({
      "/home/user/project/config.yaml": "api_token: abcdefghijklmnopqrstuvwxyz12345\n",
    });
    const t = createSearchRepoFilesTool(ctx);
    const result = await t.execute!({ pattern: "api_token" }, toolCallInfo);
    const matches = (result as { matches: RepoSearchMatch[] }).matches;
    expect(matches).toHaveLength(1);
    expect(matches[0].line).toBe("api_token: ***REDACTED***");
    expect(matches[0].line).not.toContain("abcdefghijklmnopqrstuvwxyz12345");
  });
});

describe("createDetectRepoConfigTool", () => {
  it("not found when no config exists", async () => {
    const ctx = createTestContext();
    const t = createDetectRepoConfigTool(ctx);
    const result = await t.execute!({}, toolCallInfo);
    expect(result).toMatchObject({ success: true, found: false });
  });

  it("finds i18n.yml", async () => {
    const yaml = `locales:
  source: en
  targets:
    - fr
    - de
buckets:
  default:
    files:
      - from: src/en.json
        to: translations/{locale}.json
storage:
  adapter: lokalise
`;
    const ctx = createTestContext({ "/home/user/project/i18n.yml": yaml });
    const t = createDetectRepoConfigTool(ctx);
    const result = await t.execute!({}, toolCallInfo);
    expect(result).toMatchObject({ success: true, found: true, configPath: "i18n.yml" });
    const config = (result as { config?: I18NConfigSummary }).config;
    expect(config?.sourceLocale).toBe("en");
    expect(config?.targetLocales).toEqual(["fr", "de"]);
    expect(config?.buckets).toContain("default");
    expect(config?.storageAdapter).toBe("lokalise");
  });

  it("finds i18n.jsonc", async () => {
    const jsonc = `{
  "locales": { "source": "en", "targets": ["ja"] },
  "buckets": { "app": { "files": [{ "from": "a", "to": "b" }] } },
  "llm": { "profiles": { "default": { "provider": "openai", "model": "x" } } }
}`;
    const ctx = createTestContext({ "/home/user/project/i18n.jsonc": jsonc });
    const t = createDetectRepoConfigTool(ctx);
    const result = await t.execute!({}, toolCallInfo);
    expect(result).toMatchObject({ success: true, found: true, configPath: "i18n.jsonc" });
    const config = (result as { config?: I18NConfigSummary }).config;
    expect(config?.sourceLocale).toBe("en");
    expect(config?.targetLocales).toEqual(["ja"]);
    expect(config?.buckets).toContain("app");
  });

  it("finds i18n.jsonc with comments and trailing commas", async () => {
    const jsonc = `{
  // Locale settings
  "locales": {
    "source": "en",
    "targets": ["fr", "de",],
  },
  "buckets": {
    "app": {
      "files": [
        {
          "from": "src/en.json",
          "to": "translations/{locale}.json",
        },
      ],
    },
  },
  /*
   * Storage settings
   */
  "storage": {
    "adapter": "local",
  },
}`;
    const ctx = createTestContext({ "/home/user/project/i18n.jsonc": jsonc });
    const t = createDetectRepoConfigTool(ctx);
    const result = await t.execute!({}, toolCallInfo);
    expect(result).toMatchObject({ success: true, found: true, configPath: "i18n.jsonc" });
    const config = (result as { config?: I18NConfigSummary }).config;
    expect(config?.sourceLocale).toBe("en");
    expect(config?.targetLocales).toEqual(["fr", "de"]);
    expect(config?.buckets).toContain("app");
    expect(config?.storageAdapter).toBe("local");
  });
});

describe("createRepoGitStateTool", () => {
  it("error when not a repo", async () => {
    const ctx = createTestContext();
    // Register a mock git command that simulates "not a repo".
    ctx.bash.registerCommand(
      defineCommand("git", async () => ({
        stdout: "",
        stderr: "fatal: not a git repository",
        exitCode: 128,
      })),
    );
    const t = createRepoGitStateTool(ctx);
    const result = await t.execute!({}, toolCallInfo);
    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toContain("git");
  });

  it("clean state", async () => {
    const ctx = createTestContext();
    ctx.bash.registerCommand(
      defineCommand("git", async (args) => {
        if (args[2] === "rev-parse" && args[3] === "--abbrev-ref") {
          return { stdout: "main\n", stderr: "", exitCode: 0 };
        }
        if (args[2] === "rev-parse" && args[3] === "HEAD") {
          return { stdout: "abc123def456789012345678901234567890abcd\n", stderr: "", exitCode: 0 };
        }
        if (args[2] === "status" && args[3] === "--porcelain") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    );

    const t = createRepoGitStateTool(ctx);
    const result = await t.execute!({}, toolCallInfo);
    expect(result).toMatchObject({
      success: true,
      branch: "main",
      isDirty: false,
      changedFiles: [],
    });
    expect((result as { commit: string }).commit).toHaveLength(40);
  });

  it("dirty state", async () => {
    const ctx = createTestContext();
    ctx.bash.registerCommand(
      defineCommand("git", async (args) => {
        if (args[2] === "rev-parse" && args[3] === "--abbrev-ref") {
          return { stdout: "main\n", stderr: "", exitCode: 0 };
        }
        if (args[2] === "rev-parse" && args[3] === "HEAD") {
          return { stdout: "abc123def456789012345678901234567890abcd\n", stderr: "", exitCode: 0 };
        }
        if (args[2] === "status" && args[3] === "--porcelain") {
          return { stdout: " M dirty.txt\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    );

    const t = createRepoGitStateTool(ctx);
    const result = await t.execute!({}, toolCallInfo);
    expect(result).toMatchObject({
      success: true,
      isDirty: true,
    });
    expect((result as { changedFiles: string[] }).changedFiles).toContain("dirty.txt");
  });
});

describe("createRunHyperlocaliseCliTool", () => {
  it("rejects unapproved subcommand at schema level", async () => {
    const ctx = createTestContext();
    const t = createRunHyperlocaliseCliTool(ctx);
    // The tool schema only allows local read-only commands for now, so parse should fail.
    const parse = (t as unknown as { inputSchema: z.ZodSchema<unknown> }).inputSchema.safeParse({
      subcommand: "sync",
    });
    expect(parse.success).toBe(false);
  });

  it("approved subcommand runs", async () => {
    const ctx = createTestContext();
    ctx.bash.registerCommand(
      defineCommand("hl", async (args) => ({
        stdout: `subcommand=${args[0]}\n`,
        stderr: "",
        exitCode: 0,
      })),
    );

    const t = createRunHyperlocaliseCliTool(ctx);
    const result = await t.execute!({ subcommand: "check" }, toolCallInfo);
    expect(result).toMatchObject({ success: true, exitCode: 0 });
    expect((result as { stdout: string }).stdout).toContain("subcommand=check");
  });

  it.each(["phrase", "crowdin", "lokalise"] as const)(
    "rejects provider/TMS actions for %s for now",
    async (provider) => {
      const ctx = createTestContext();
      const t = createRunHyperlocaliseCliTool(ctx);
      const parse = (t as unknown as { inputSchema: z.ZodSchema<unknown> }).inputSchema.safeParse({
        subcommand: provider,
        args: ["glossary", "download"],
      });
      expect(parse.success).toBe(false);
    },
  );

  it("constructs args safely", async () => {
    const ctx = createTestContext();
    ctx.bash.registerCommand(
      defineCommand("hl", async (args) => ({
        stdout: args.join("\n") + "\n",
        stderr: "",
        exitCode: 0,
      })),
    );

    const t = createRunHyperlocaliseCliTool(ctx);
    const result = await t.execute!(
      { subcommand: "check", args: ["bucket1"], flags: { format: "json" }, boolFlags: ["quiet"] },
      toolCallInfo,
    );
    expect(result).toMatchObject({ success: true, exitCode: 0 });
    const stdout = (result as { stdout: string }).stdout;
    const lines = stdout.trim().split("\n");
    expect(lines).toContain("check");
    expect(lines).toContain("bucket1");
    expect(lines).toContain("--format=json");
    expect(lines).toContain("--quiet");
  });

  it("truncates large output", async () => {
    const ctx = createTestContext();
    ctx.bash.registerCommand(
      defineCommand("hl", async () => ({
        stdout: "A".repeat(200_000),
        stderr: "",
        exitCode: 0,
      })),
    );

    const t = createRunHyperlocaliseCliTool(ctx);
    const result = await t.execute!({ subcommand: "check" }, toolCallInfo);
    expect(result).toMatchObject({ success: true, truncated: true });
  });

  it("redacts secrets in output", async () => {
    const ctx = createTestContext();
    ctx.bash.registerCommand(
      defineCommand("hl", async () => ({
        stdout: "token=abcdefghijklmnopqrstuvwxyz12345\n",
        stderr: "",
        exitCode: 0,
      })),
    );

    const t = createRunHyperlocaliseCliTool(ctx);
    const result = await t.execute!({ subcommand: "check" }, toolCallInfo);
    const stdout = (result as { stdout: string }).stdout;
    expect(stdout).toContain("***REDACTED***");
    expect(stdout).not.toContain("abcdefghijklmnopqrstuvwxyz12345");
  });
});

describe("buildHlArgs", () => {
  it("builds correct args", () => {
    expect(
      buildHlArgs({
        subcommand: "check",
        args: ["bucket1"],
        flags: { format: "json" },
        boolFlags: ["quiet"],
      }),
    ).toEqual(["check", "bucket1", "--quiet", "--format=json"]);
  });

  it("rejects positional arg that looks like flag", () => {
    expect(() => buildHlArgs({ subcommand: "check", args: ["--bad"] })).toThrow(
      "looks like a flag",
    );
  });

  it("rejects $ in positional arg", () => {
    expect(() => buildHlArgs({ subcommand: "check", args: ["$(cat /etc/passwd)"] })).toThrow(
      "invalid characters",
    );
  });

  it("rejects backtick in positional arg", () => {
    expect(() => buildHlArgs({ subcommand: "check", args: ["`id`"] })).toThrow(
      "invalid characters",
    );
  });

  it("rejects dangerous flag", () => {
    expect(() => buildHlArgs({ subcommand: "check", flags: { token: "secret" } })).toThrow(
      "not allowed",
    );
  });

  it("rejects dangerous bool flag", () => {
    expect(() => buildHlArgs({ subcommand: "check", boolFlags: ["api-token"] })).toThrow(
      "not allowed",
    );
  });

  it("rejects $ in flag value", () => {
    expect(() => buildHlArgs({ subcommand: "check", flags: { format: "$json" } })).toThrow(
      "invalid characters",
    );
  });

  it("rejects backtick in flag value", () => {
    expect(() => buildHlArgs({ subcommand: "check", flags: { format: "`json`" } })).toThrow(
      "invalid characters",
    );
  });
});
