import { describe, expect, it } from "vite-plus/test";
import { Bash, defineCommand, InMemoryFs } from "just-bash";
import { z } from "zod";

import { isErr, isOk } from "@/lib/primitives/result/results";

import { createFuzzySearchTool, createGrepTool, createReadTool, parseGrepLine } from "./workspace";

import {
  buildHlArgs,
  createDetectRepoConfigTool,
  createGitHistoryTool,
  createRepoGitStateTool,
  createRunHyperlocaliseCliTool,
  redact,
  type I18NConfigSummary,
} from "./repo-read-tools";

function createTestContext(files: Record<string, string> = {}): { bash: Bash } {
  const fs = new InMemoryFs(files);
  const bash = new Bash({ fs, cwd: "/home/user/project" });
  bash.registerCommand(
    defineCommand("rg", async () => ({
      stdout: "",
      stderr: "rg: command not found",
      exitCode: 127,
    })),
  );
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

describe("createReadTool", () => {
  it("reads a file with line numbers", async () => {
    const ctx = createTestContext({ "/home/user/project/readme.md": "hello\nworld" });
    const t = createReadTool(ctx);
    const result = await t.execute!({ filePath: "readme.md" }, toolCallInfo);
    expect(result).toMatchObject({ success: true, path: "readme.md", totalLines: 2 });
    expect((result as { content: string }).content).toContain("1: hello");
    expect((result as { content: string }).content).toContain("2: world");
  });

  it("returns error for missing file", async () => {
    const ctx = createTestContext();
    const t = createReadTool(ctx);
    const result = await t.execute!({ filePath: "missing.txt" }, toolCallInfo);
    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toBeTruthy();
  });

  it("reads with line offset", async () => {
    const ctx = createTestContext({ "/home/user/project/readme.md": "line1\nline2\nline3" });
    const t = createReadTool(ctx);
    const result = await t.execute!({ filePath: "readme.md", offset: 2, limit: 1 }, toolCallInfo);
    expect((result as { content: string }).content).toContain("2: line2");
  });

  it("does not underflow endLine when the requested range is past EOF", async () => {
    const ctx = createTestContext({ "/home/user/project/readme.md": "line1\nline2" });
    const t = createReadTool(ctx);
    const result = await t.execute!({ filePath: "readme.md", offset: 10, limit: 5 }, toolCallInfo);
    expect(result).toMatchObject({ success: true, startLine: 10, endLine: 10 });
    expect((result as { content: string }).content).toBe("");
  });

  it("rejects symlink reads from the sandbox readFile guard", async () => {
    const t = createReadTool({
      bash: {
        exec: async () => ({
          stdout: "",
          stderr: "",
          exitCode: 0,
          env: {},
        }),
        readFile: async () => {
          throw new Error("Symlink reads are not allowed.");
        },
      },
    });
    const result = await t.execute!({ filePath: "leak.yaml" }, toolCallInfo);
    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toContain("Symlink reads are not allowed");
  });

  it("redacts secrets in file content", async () => {
    const ctx = createTestContext({
      "/home/user/project/.env": "OPENAI_API_KEY=sk-12345\ntoken=abcdefghijklmnopqrstuvwxyz12345",
    });
    const t = createReadTool(ctx);
    const result = await t.execute!({ filePath: ".env" }, toolCallInfo);
    const content = (result as { content: string }).content;
    expect(content).toContain("OPENAI_API_KEY=***REDACTED***");
    expect(content).toContain("token=***REDACTED***");
    expect(content).not.toContain("abcdefghijklmnopqrstuvwxyz12345");
  });
});

describe("parseGrepLine", () => {
  it("parses filename-prefixed grep output", () => {
    expect(parseGrepLine("src/app/[locale]/page.tsx:12:return <h1>Dashboard</h1>")).toEqual({
      path: "src/app/[locale]/page.tsx",
      line: 12,
      content: "return <h1>Dashboard</h1>",
    });
  });

  it("keeps colons in matched content", () => {
    expect(parseGrepLine("src/config.ts:4:const url = 'http://localhost:3000';")).toEqual({
      path: "src/config.ts",
      line: 4,
      content: "const url = 'http://localhost:3000';",
    });
  });

  it("parses single-file grep output with a fallback path", () => {
    expect(parseGrepLine("3:func main() {}", "a.go")).toEqual({
      path: "a.go",
      line: 3,
      content: "func main() {}",
    });
  });

  it("keeps colons in single-file grep output content", () => {
    expect(
      parseGrepLine("8:export const path = '/api/:id';", "src/app/api/[[...route]]/route.ts"),
    ).toEqual({
      path: "src/app/api/[[...route]]/route.ts",
      line: 8,
      content: "export const path = '/api/:id';",
    });
  });

  it("does not parse single-file grep output without a fallback path", () => {
    expect(parseGrepLine("3:func main() {}")).toBeNull();
  });

  it("returns null for grep messages that are not match lines", () => {
    expect(parseGrepLine("Binary file a.go matches", "a.go")).toBeNull();
  });
});

describe("createGrepTool", () => {
  it("uses ripgrep vimgrep output when available", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const t = createGrepTool({
      bash: {
        exec: async (command, options) => {
          calls.push({ command, args: options?.args ?? [] });
          return {
            stdout: "src/app.tsx:2:10:  return <h1>Dashboard</h1>;\n",
            stderr: "",
            exitCode: 0,
            env: {},
          };
        },
        readFile: async () => "",
      },
    });

    const result = await t.execute!({ pattern: "Dashboard", include: "*.tsx" }, toolCallInfo);

    expect(calls).toEqual([
      {
        command: "rg",
        args: expect.arrayContaining([
          "--vimgrep",
          "--fixed-strings",
          "--glob",
          "*.tsx",
          "Dashboard",
          ".",
        ]),
      },
    ]);
    expect(result).toMatchObject({ success: true, matchCount: 1, filesWithMatches: 1 });
    expect(
      (result as { matches: Array<{ path: string; line: number; content: string }> }).matches,
    ).toEqual([
      {
        path: "src/app.tsx",
        line: 2,
        content: "  return <h1>Dashboard</h1>;",
      },
    ]);
  });

  it("falls back to POSIX grep when ripgrep is unavailable", async () => {
    const calls: string[] = [];
    const t = createGrepTool({
      bash: {
        exec: async (command) => {
          calls.push(command);
          if (command === "rg") {
            return { stdout: "", stderr: "rg: command not found", exitCode: 127, env: {} };
          }
          return {
            stdout: "a.go:3:func main() {}\n",
            stderr: "",
            exitCode: 0,
            env: {},
          };
        },
        readFile: async () => "",
      },
    });

    const result = await t.execute!({ pattern: "func main" }, toolCallInfo);

    expect(calls).toEqual(["rg", "grep"]);
    expect(result).toMatchObject({ success: true });
    expect((result as { matches: Array<{ path: string }> }).matches[0].path).toBe("a.go");
  });

  it("constrains ripgrep include globs when searching globbed paths", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const t = createGrepTool({
      bash: {
        exec: async (command, options) => {
          calls.push({ command, args: options?.args ?? [] });
          return {
            stdout: "src/user/routes/page.tsx:2:10:  return <h1>Dashboard</h1>;\n",
            stderr: "",
            exitCode: 0,
            env: {},
          };
        },
        readFile: async () => "",
      },
    });

    const result = await t.execute!(
      { pattern: "Dashboard", path: "src/*/routes", include: "*.tsx" },
      toolCallInfo,
    );

    expect(calls).toEqual([
      {
        command: "rg",
        args: expect.arrayContaining(["--glob", "src/*/routes/**/*.tsx", "Dashboard", "."]),
      },
    ]);
    expect(calls[0]?.args).not.toContain("*.tsx");
    expect(result).toMatchObject({ success: true, matchCount: 1, filesWithMatches: 1 });
    expect(
      (result as { matches: Array<{ path: string; line: number; content: string }> }).matches,
    ).toEqual([
      {
        path: "src/user/routes/page.tsx",
        line: 2,
        content: "  return <h1>Dashboard</h1>;",
      },
    ]);
  });

  it("finds matches", async () => {
    const ctx = createTestContext({
      "/home/user/project/a.go": "package main\n\nfunc main() {}\n",
      "/home/user/project/b.go": "package test\n\nfunc helper() {}\n",
    });
    const t = createGrepTool(ctx);
    const result = await t.execute!({ pattern: "func main" }, toolCallInfo);
    expect(result).toMatchObject({ success: true });
    expect((result as { matches: Array<{ path: string }> }).matches).toHaveLength(1);
    expect((result as { matches: Array<{ path: string }> }).matches[0].path).toBe("a.go");
  });

  it("finds matches when searching one file", async () => {
    const ctx = createTestContext({
      "/home/user/project/a.go": "package main\n\nfunc main() {}\n",
    });
    const t = createGrepTool(ctx);
    const result = await t.execute!({ pattern: "func main", path: "a.go" }, toolCallInfo);

    expect(result).toMatchObject({ success: true });
    expect((result as { matches: Array<{ path: string; line: number }> }).matches).toEqual([
      { path: "a.go", line: 3, content: "func main() {}" },
    ]);
  });

  it("finds matches in Next.js route files with bracketed path segments", async () => {
    const ctx = createTestContext({
      "/home/user/project/src/app/[locale]/dashboard/page.tsx":
        "export default function Page() {\n  return <h1>Dashboard</h1>;\n}\n",
      "/home/user/project/src/app/api/[[...route]]/route.ts": "export const runtime = 'nodejs';\n",
    });
    const t = createGrepTool(ctx);
    const pageResult = await t.execute!(
      { pattern: "Dashboard", path: "src/app/[locale]/dashboard/page.tsx" },
      toolCallInfo,
    );
    const routeResult = await t.execute!(
      { pattern: "runtime", path: "src/app/api/[[...route]]/route.ts" },
      toolCallInfo,
    );

    expect(pageResult).toMatchObject({ success: true });
    expect((pageResult as { matches: Array<{ path: string; line: number }> }).matches).toEqual([
      {
        path: "src/app/[locale]/dashboard/page.tsx",
        line: 2,
        content: "  return <h1>Dashboard</h1>;",
      },
    ]);
    expect(routeResult).toMatchObject({ success: true });
    expect((routeResult as { matches: Array<{ path: string; line: number }> }).matches).toEqual([
      {
        path: "src/app/api/[[...route]]/route.ts",
        line: 1,
        content: "export const runtime = 'nodejs';",
      },
    ]);
  });

  it("finds matches when searching a Next.js bracketed route directory", async () => {
    const ctx = createTestContext({
      "/home/user/project/src/app/[locale]/dashboard/page.tsx":
        "export default function Page() {\n  return <h1>Dashboard</h1>;\n}\n",
      "/home/user/project/src/app/[locale]/settings/page.tsx":
        "export default function Page() {\n  return <h1>Settings</h1>;\n}\n",
    });
    const t = createGrepTool(ctx);
    const result = await t.execute!(
      { pattern: "Dashboard", path: "src/app/[locale]" },
      toolCallInfo,
    );

    expect(result).toMatchObject({ success: true });
    expect((result as { matches: Array<{ path: string; line: number }> }).matches).toEqual([
      {
        path: "src/app/[locale]/dashboard/page.tsx",
        line: 2,
        content: "  return <h1>Dashboard</h1>;",
      },
    ]);
  });

  it("supports case-insensitive regex searches in bracketed route directories", async () => {
    const ctx = createTestContext({
      "/home/user/project/src/app/[locale]/dashboard/page.tsx":
        "export default function Page() {\n  return <h1>Dashboard</h1>;\n}\n",
      "/home/user/project/src/app/[locale]/settings/page.tsx":
        "export default function Page() {\n  return <h1>Settings</h1>;\n}\n",
    });
    const t = createGrepTool(ctx);
    const result = await t.execute!(
      {
        pattern: "dash(board)?",
        path: "src/app/[locale]",
        caseSensitive: false,
        regex: true,
      },
      toolCallInfo,
    );

    expect(result).toMatchObject({ success: true });
    expect((result as { matches: Array<{ path: string; line: number }> }).matches).toEqual([
      {
        path: "src/app/[locale]/dashboard/page.tsx",
        line: 2,
        content: "  return <h1>Dashboard</h1>;",
      },
    ]);
  });

  it("returns empty results for missing patterns in bracketed route directories", async () => {
    const ctx = createTestContext({
      "/home/user/project/src/app/[locale]/dashboard/page.tsx":
        "export default function Page() {\n  return <h1>Dashboard</h1>;\n}\n",
    });
    const t = createGrepTool(ctx);
    const result = await t.execute!(
      { pattern: "Settings", path: "src/app/[locale]" },
      toolCallInfo,
    );

    expect(result).toMatchObject({
      success: true,
      matchCount: 0,
      filesWithMatches: 0,
      matches: [],
    });
  });

  it("parses single-file grep output without a filename prefix", async () => {
    const t = createGrepTool({
      bash: {
        exec: async (command) =>
          command === "rg"
            ? {
                stdout: "",
                stderr: "rg: command not found",
                exitCode: 127,
                env: {},
              }
            : {
                stdout: "3:func main() {}\n",
                stderr: "",
                exitCode: 0,
                env: {},
              },
        readFile: async () => "",
      },
    });

    const result = await t.execute!({ pattern: "func main", path: "a.go" }, toolCallInfo);

    expect(result).toMatchObject({ success: true });
    expect((result as { matches: Array<{ path: string; line: number }> }).matches).toEqual([
      { path: "a.go", line: 3, content: "func main() {}" },
    ]);
  });

  it("keeps colons in single-file grep matches", async () => {
    const t = createGrepTool({
      bash: {
        exec: async (command) =>
          command === "rg"
            ? {
                stdout: "",
                stderr: "rg: command not found",
                exitCode: 127,
                env: {},
              }
            : command === "find"
              ? {
                  stdout: "src/app/api/[[...route]]/route.ts\n",
                  stderr: "",
                  exitCode: 0,
                  env: {},
                }
              : {
                  stdout: "8:export const path = '/api/:id';\n",
                  stderr: "",
                  exitCode: 0,
                  env: {},
                },
        readFile: async () => "",
      },
    });

    const result = await t.execute!(
      { pattern: "/api/:id", path: "src/app/api/[[...route]]/route.ts" },
      toolCallInfo,
    );

    expect(result).toMatchObject({ success: true });
    expect((result as { matches: Array<{ path: string; line: number }> }).matches).toEqual([
      {
        path: "src/app/api/[[...route]]/route.ts",
        line: 8,
        content: "export const path = '/api/:id';",
      },
    ]);
  });

  it("ignores unparsable grep output when at least one match line parses", async () => {
    const t = createGrepTool({
      bash: {
        exec: async (command) =>
          command === "rg"
            ? {
                stdout: "",
                stderr: "rg: command not found",
                exitCode: 127,
                env: {},
              }
            : {
                stdout: "Binary file a.go matches\n3:func main() {}\n",
                stderr: "",
                exitCode: 0,
                env: {},
              },
        readFile: async () => "",
      },
    });

    const result = await t.execute!({ pattern: "func main", path: "a.go" }, toolCallInfo);

    expect(result).toMatchObject({ success: true });
    expect((result as { matches: Array<{ path: string; line: number }> }).matches).toEqual([
      { path: "a.go", line: 3, content: "func main() {}" },
    ]);
  });

  it("does not report zero matches when grep output is unparsable", async () => {
    const t = createGrepTool({
      bash: {
        exec: async (command) =>
          command === "rg"
            ? {
                stdout: "",
                stderr: "rg: command not found",
                exitCode: 127,
                env: {},
              }
            : {
                stdout: "Binary file a.go matches\n",
                stderr: "",
                exitCode: 0,
                env: {},
              },
        readFile: async () => "",
      },
    });

    const result = await t.execute!({ pattern: "func main", path: "a.go" }, toolCallInfo);

    expect(result).toMatchObject({
      success: false,
      error: "Search returned output, but no match lines could be parsed",
      matches: [],
    });
  });

  it("returns empty for missing pattern", async () => {
    const ctx = createTestContext({
      "/home/user/project/a.go": "package main\n",
    });
    const t = createGrepTool(ctx);
    const result = await t.execute!({ pattern: "zzzzz" }, toolCallInfo);
    expect(result).toMatchObject({ success: true, matches: [] });
  });

  it("truncates at max results", async () => {
    const ctx = createTestContext({
      "/home/user/project/a.go": "func a() {}\n",
      "/home/user/project/b.go": "func b() {}\n",
    });
    const t = createGrepTool(ctx);
    const result = await t.execute!({ pattern: "func", maxResults: 1 }, toolCallInfo);
    expect(result).toMatchObject({ success: true, truncated: true });
    expect((result as { matches: unknown[] }).matches).toHaveLength(1);
  });

  it("redacts secrets in matched lines", async () => {
    const ctx = createTestContext({
      "/home/user/project/config.yaml": "api_token: abcdefghijklmnopqrstuvwxyz12345\n",
    });
    const t = createGrepTool(ctx);
    const result = await t.execute!({ pattern: "api_token" }, toolCallInfo);
    const matches = (result as { matches: Array<{ content: string }> }).matches;
    expect(matches).toHaveLength(1);
    expect(matches[0].content).toBe("api_token: ***REDACTED***");
    expect(matches[0].content).not.toContain("abcdefghijklmnopqrstuvwxyz12345");
  });
});

describe("createFuzzySearchTool", () => {
  it("finds stemmed UI label variants", async () => {
    const ctx = createTestContext({
      "/home/user/project/src/integrations.tsx":
        "export function Integrations() {\n  return <button>Repository configuration</button>;\n}\n",
    });
    const t = createFuzzySearchTool(ctx);
    const result = await t.execute!({ query: "Configure" }, toolCallInfo);

    expect(result).toMatchObject({ success: true });
    const matches = (result as { matches: Array<{ path: string; matchedText: string }> }).matches;
    expect(matches[0]).toMatchObject({
      path: "src/integrations.tsx",
      matchedText: "configuration",
    });
  });

  it("returns empty matches when no fuzzy candidate exists", async () => {
    const ctx = createTestContext({
      "/home/user/project/src/home.tsx": "export const title = 'Dashboard';\n",
    });
    const t = createFuzzySearchTool(ctx);
    const result = await t.execute!({ query: "Configure" }, toolCallInfo);

    expect(result).toMatchObject({ success: true, matches: [] });
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

describe("createGitHistoryTool", () => {
  it("discovers Hyperlocalise source files before Crowdin fallback", async () => {
    const ctx = createTestContext({
      "/home/user/project/i18n.yml": "locales:\n  source: en-US\n",
      "/home/user/project/crowdin.yml": "files:\n  - source: /ignored.json\n",
    });
    const yqCalls: string[][] = [];
    const gitCalls: string[][] = [];
    ctx.bash.registerCommand(
      defineCommand("yq", async (args) => {
        yqCalls.push(args);
        return {
          stdout: JSON.stringify({
            locales: { source: "en-US" },
            buckets: { web: { files: [{ from: "lang/{{source}}.json", to: "lang/fr.json" }] } },
          }),
          stderr: "",
          exitCode: 0,
        };
      }),
    );
    ctx.bash.registerCommand(
      defineCommand("git", async (args) => {
        gitCalls.push(args);
        if (args[0] === "ls-files") {
          return { stdout: "lang/en-US.json\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "log") {
          return {
            stdout: "abc\t2026-07-01T00:00:00Z\tMina\tUpdate strings\nlang/en-US.json\n",
            stderr: "",
            exitCode: 0,
          };
        }
        return { stdout: "", stderr: "", exitCode: 1 };
      }),
    );

    const t = createGitHistoryTool(ctx);
    const result = await t.execute!(
      { mode: "changedFiles", since: "1 week ago", maxResults: 10 },
      toolCallInfo,
    );

    expect(result).toMatchObject({
      success: true,
      mode: "changedFiles",
      files: ["lang/en-US.json"],
      discovery: { configKind: "hyperlocalise", configPath: "i18n.yml" },
    });
    expect(yqCalls[0]).toEqual(["-o", "json", ".", "i18n.yml"]);
    expect(gitCalls).toContainEqual(["ls-files", "--", "lang/en-US.json"]);
    expect(gitCalls.find((args) => args[0] === "log")).toEqual(
      expect.arrayContaining(["--since=1 week ago", "--", "lang/en-US.json"]),
    );
  });

  it("falls back to Crowdin files[].source", async () => {
    const ctx = createTestContext({
      "/home/user/project/crowdin.yml": "files:\n  - source: /src/messages.json\n",
    });
    ctx.bash.registerCommand(
      defineCommand("yq", async () => ({
        stdout: JSON.stringify({ files: [{ source: "/src/messages.json" }] }),
        stderr: "",
        exitCode: 0,
      })),
    );
    ctx.bash.registerCommand(
      defineCommand("git", async (args) => {
        if (args[0] === "ls-files") {
          return { stdout: "src/messages.json\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "log") {
          return { stdout: "src/messages.json\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 1 };
      }),
    );

    const t = createGitHistoryTool(ctx);
    const result = await t.execute!({ mode: "changedFiles" }, toolCallInfo);

    expect(result).toMatchObject({
      success: true,
      files: ["src/messages.json"],
      discovery: { configKind: "crowdin", configPath: "crowdin.yml" },
    });
  });

  it("reports unresolved Phrase placeholders as skipped diagnostics", async () => {
    const ctx = createTestContext({
      "/home/user/project/.phrase.yml": "phrase:\n  push:\n    sources: []\n",
    });
    ctx.bash.registerCommand(
      defineCommand("yq", async () => ({
        stdout: JSON.stringify({
          phrase: { push: { sources: [{ file: "./locales/<locale_name>.json" }] } },
        }),
        stderr: "",
        exitCode: 0,
      })),
    );

    const t = createGitHistoryTool(ctx);
    const result = await t.execute!({ mode: "changedFiles" }, toolCallInfo);

    expect(result).toMatchObject({
      success: true,
      files: [],
      discovery: {
        configKind: "phrase",
        configPath: ".phrase.yml",
        skippedPatterns: [
          {
            pattern: "./locales/<locale_name>.json",
            reason: "Pattern contains unresolved Phrase placeholder.",
          },
        ],
      },
    });
  });

  it("returns bounded file diffs", async () => {
    const ctx = createTestContext();
    ctx.bash.registerCommand(
      defineCommand("git", async (args) => {
        expect(args).toEqual(["diff", "main..HEAD", "--", "lang/en.json"]);
        return { stdout: "A".repeat(200_000), stderr: "", exitCode: 0 };
      }),
    );

    const t = createGitHistoryTool(ctx);
    const result = await t.execute!(
      { mode: "fileDiff", paths: ["lang/en.json"], range: "main..HEAD" },
      toolCallInfo,
    );

    expect(result).toMatchObject({ success: true, mode: "fileDiff", truncated: true });
    expect((result as { diff: string }).diff.length).toBeLessThan(200_000);
  });

  it("rejects option-like git revision ranges", async () => {
    const ctx = createTestContext();
    const t = createGitHistoryTool(ctx);
    const result = await t.execute!(
      { mode: "fileDiff", paths: ["lang/en.json"], range: "--no-index" },
      toolCallInfo,
    );

    expect(result).toMatchObject({
      success: false,
      error: 'Range "--no-index" must be a revision range, not a git option.',
    });
  });

  it("uses pickaxe entry log for a source string or key", async () => {
    const ctx = createTestContext();
    ctx.bash.registerCommand(
      defineCommand("git", async (args) => {
        expect(args).toEqual(
          expect.arrayContaining(["--patch", "--unified=3", "-SSave", "--", "lang/en.json"]),
        );
        return {
          stdout: 'abc\t2026-07-01T00:00:00Z\tMina\tAdd Save\n+  "save": "Save"\n',
          stderr: "",
          exitCode: 0,
        };
      }),
    );

    const t = createGitHistoryTool(ctx);
    const result = await t.execute!(
      { mode: "entryLog", paths: ["lang/en.json"], query: "Save" },
      toolCallInfo,
    );

    expect(result).toMatchObject({ success: true, mode: "entryLog", query: "Save" });
    expect((result as { log: string }).log).toContain("Add Save");
  });

  it("rejects option-like revision ranges before git log", async () => {
    const ctx = createTestContext();
    const t = createGitHistoryTool(ctx);
    const result = await t.execute!(
      { mode: "entryLog", paths: ["lang/en.json"], query: "Save", range: "--all" },
      toolCallInfo,
    );

    expect(result).toMatchObject({
      success: false,
      error: 'Range "--all" must be a revision range, not a git option.',
    });
  });

  it("rejects blame requests with multiple paths", async () => {
    const ctx = createTestContext();
    const t = createGitHistoryTool(ctx);
    const result = await t.execute!(
      { mode: "blame", paths: ["lang/en.json", "lang/fr.json"], query: "Save" },
      toolCallInfo,
    );

    expect(result).toMatchObject({
      success: false,
      error: "blame accepts exactly one path.",
    });
  });

  it("returns blame metadata for a current query line", async () => {
    const ctx = createTestContext({
      "/home/user/project/lang/en.json": '{\n  "save": "Save"\n}\n',
    });
    ctx.bash.registerCommand(
      defineCommand("git", async (args) => {
        expect(args).toEqual(["blame", "--line-porcelain", "-L2,2", "--", "lang/en.json"]);
        return {
          stdout:
            'abc1234 2 2 1\nauthor Mina\nauthor-time 1782864000\nsummary Add Save\n\t  "save": "Save"\n',
          stderr: "",
          exitCode: 0,
        };
      }),
    );

    const t = createGitHistoryTool(ctx);
    const result = await t.execute!(
      { mode: "blame", paths: ["lang/en.json"], query: "Save" },
      toolCallInfo,
    );

    expect(result).toMatchObject({
      success: true,
      mode: "blame",
      entries: [
        {
          commit: "abc1234",
          author: "Mina",
          authorTime: "1782864000",
          summary: "Add Save",
          line: '  "save": "Save"',
        },
      ],
    });
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
    const result = buildHlArgs({
      subcommand: "check",
      args: ["bucket1"],
      flags: { format: "json" },
      boolFlags: ["quiet"],
    });

    expect(isOk(result)).toBe(true);
    if (isErr(result)) throw new Error("expected valid hl args");
    expect(result.value).toEqual(["check", "bucket1", "--quiet", "--format=json"]);
  });

  it("rejects positional arg that looks like flag", () => {
    expect(buildHlArgs({ subcommand: "check", args: ["--bad"] })).toMatchObject({
      ok: false,
      error: { code: "positional_arg_looks_like_flag" },
    });
  });

  it("rejects $ in positional arg", () => {
    expect(buildHlArgs({ subcommand: "check", args: ["$(cat /etc/passwd)"] })).toMatchObject({
      ok: false,
      error: { code: "flag_value_contains_invalid_characters" },
    });
  });

  it("rejects backtick in positional arg", () => {
    expect(buildHlArgs({ subcommand: "check", args: ["`id`"] })).toMatchObject({
      ok: false,
      error: { code: "flag_value_contains_invalid_characters" },
    });
  });

  it("rejects dangerous flag", () => {
    expect(buildHlArgs({ subcommand: "check", flags: { token: "secret" } })).toMatchObject({
      ok: false,
      error: { code: "flag_not_allowed" },
    });
  });

  it("rejects dangerous bool flag", () => {
    expect(buildHlArgs({ subcommand: "check", boolFlags: ["api-token"] })).toMatchObject({
      ok: false,
      error: { code: "flag_not_allowed" },
    });
  });

  it("rejects $ in flag value", () => {
    expect(buildHlArgs({ subcommand: "check", flags: { format: "$json" } })).toMatchObject({
      ok: false,
      error: { code: "flag_value_contains_invalid_characters" },
    });
  });

  it("rejects backtick in flag value", () => {
    expect(buildHlArgs({ subcommand: "check", flags: { format: "`json`" } })).toMatchObject({
      ok: false,
      error: { code: "flag_value_contains_invalid_characters" },
    });
  });
});
