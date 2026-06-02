import { tool, type ToolSet } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import type { ToolContext } from "@/lib/agent-contracts/tool-context";

import { wrapToolSetWithLogging } from "./tool-logging";

const consoleLogCalls: unknown[][] = [];

type TestExecutableTool = {
  execute: (input: unknown, options: unknown) => Promise<unknown>;
};

beforeEach(() => {
  consoleLogCalls.length = 0;
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    consoleLogCalls.push(args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function getLoggedEvents(): unknown[] {
  return consoleLogCalls.map(([, event]) => event);
}

function createToolContext(): ToolContext {
  return {
    conversationId: "conversation_123",
    organizationId: "organization_123",
    localUserId: "user_123",
    membershipRole: "member",
    projectId: "project_123",
    db: {} as never,
    sandboxId: "sandbox_123",
    workMode: "read_only",
    repositorySource: "slack",
    agentSession: { todos: [] },
    githubContext: {
      resolved: true,
      installationId: 123,
      repositoryFullName: "acme/private-repo",
      branch: "feature/customer-name",
      commitSha: "abcdef1234567890",
    },
  };
}

describe("wrapToolSetWithLogging", () => {
  it("logs safe metadata for successful tool calls", async () => {
    const sourceText = "Projects, branches, and reviewed strings.";
    const matchedLine = `detail: "${sourceText}"`;
    const grepTool = tool({
      description: "test grep",
      inputSchema: z.object({
        pattern: z.string(),
        path: z.string(),
        regex: z.boolean(),
      }),
      execute: async (input) => ({
        success: true,
        pattern: input.pattern,
        matchCount: 1,
        filesWithMatches: 1,
        matches: [
          {
            path: "src/app/(authenticated)/org/[organizationSlug]/integrations/_components/integrations-page-content.tsx",
            line: 241,
            content: matchedLine,
            matchedText: input.pattern,
            reason: "line contains compact query",
            score: 1,
          },
        ],
      }),
    });

    const wrappedTools = wrapToolSetWithLogging({ grep: grepTool } as ToolSet, createToolContext());
    const wrappedGrep = wrappedTools.grep as typeof grepTool;

    await wrappedGrep.execute!(
      {
        pattern: sourceText,
        path: "src/app/(authenticated)/org/[organizationSlug]/integrations/_components",
        regex: false,
      },
      { toolCallId: "call_123", messages: [] },
    );

    const loggedEvents = getLoggedEvents();
    expect(consoleLogCalls).toHaveLength(2);
    expect(consoleLogCalls[0]?.[0]).toBe("agent tool call started");
    expect(loggedEvents[0]).toMatchObject({
      toolName: "grep",
      toolCallId: "call_123",
    });
    expect(consoleLogCalls[1]?.[0]).toBe("agent tool call completed");
    expect(loggedEvents[1]).toMatchObject({
      toolName: "grep",
    });

    const serializedLogs = JSON.stringify(consoleLogCalls);
    expect(serializedLogs).not.toContain(sourceText);
    expect(serializedLogs).not.toContain(matchedLine);
    expect(serializedLogs).not.toContain("acme/private-repo");
    expect(serializedLogs).not.toContain("feature/customer-name");
    expect(serializedLogs).not.toContain("(authenticated)/org/[organizationSlug]");
    expect(serializedLogs).toContain("matchCount");
    expect(serializedLogs).toContain("integrations-page-content.tsx");
  });

  it("logs the exact bash command without logging command output", async () => {
    const command = "git diff -- src/customer-name/private-file.ts";
    const bashTool = tool({
      description: "test bash",
      inputSchema: z.object({
        command: z.string(),
      }),
      execute: async () => ({
        success: true,
        exitCode: 0,
        stdout: "private output",
        stderr: "",
      }),
    });

    const wrappedTools = wrapToolSetWithLogging({ bash: bashTool } as ToolSet, createToolContext());
    const wrappedBash = wrappedTools.bash as typeof bashTool;

    await wrappedBash.execute!({ command }, { toolCallId: "call_bash", messages: [] });

    const loggedEvents = getLoggedEvents();
    expect(consoleLogCalls[0]?.[0]).toBe("agent tool call started");
    expect(loggedEvents[0]).toMatchObject({
      toolName: "bash",
      input: {
        command: {
          command,
          bin: "git",
          action: "diff",
          argCount: 3,
        },
      },
    });

    const serializedLogs = JSON.stringify(consoleLogCalls);
    expect(serializedLogs).toContain(command);
    expect(serializedLogs).not.toContain("private output");
  });

  it("logs failures and rethrows the original error", async () => {
    const failingTool: TestExecutableTool = {
      execute: async (_input: unknown, _options: unknown) => {
        throw new Error("sandbox unavailable");
      },
    };

    const wrappedTools = wrapToolSetWithLogging(
      { fuzzySearch: failingTool } as unknown as ToolSet,
      {
        ...createToolContext(),
        githubContext: null,
      },
    );
    const wrappedFuzzySearch = wrappedTools.fuzzySearch as TestExecutableTool;

    await expect(
      wrappedFuzzySearch.execute!(
        { query: "Reviewed strings" },
        { toolCallId: "call_failure", messages: [] },
      ),
    ).rejects.toThrow("sandbox unavailable");

    const loggedEvents = getLoggedEvents();
    expect(consoleLogCalls).toHaveLength(2);
    expect(consoleLogCalls[1]?.[0]).toBe("agent tool call failed");
    expect(loggedEvents[1]).toMatchObject({
      toolName: "fuzzySearch",
      toolCallId: "call_failure",
    });
    expect(JSON.stringify(consoleLogCalls)).not.toContain("Reviewed strings");
  });
});
