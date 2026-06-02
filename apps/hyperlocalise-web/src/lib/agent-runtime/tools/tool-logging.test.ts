import { tool, type ToolSet } from "ai";
import type { DrainContext, WideEvent } from "evlog";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { configureLoggerForTest } from "@/lib/log";

import { wrapToolSetWithLogging } from "./tool-logging";

const drainedEvents: WideEvent[] = [];

type TestExecutableTool = {
  execute: (input: unknown, options: unknown) => Promise<unknown>;
};

beforeEach(() => {
  drainedEvents.length = 0;
  configureLoggerForTest({
    silent: true,
    drain: (context: DrainContext) => {
      drainedEvents.push(context.event);
    },
  });
});

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

    expect(drainedEvents).toHaveLength(2);
    expect(drainedEvents[0]).toMatchObject({
      prefix: "agent-tool-call",
      message: "agent tool call started",
      toolName: "grep",
      toolCallId: "call_123",
    });
    expect(drainedEvents[1]).toMatchObject({
      prefix: "agent-tool-call",
      message: "agent tool call completed",
      toolName: "grep",
    });

    const serializedLogs = JSON.stringify(drainedEvents);
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

    expect(drainedEvents[0]).toMatchObject({
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

    const serializedLogs = JSON.stringify(drainedEvents);
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

    expect(drainedEvents).toHaveLength(2);
    expect(drainedEvents[1]).toMatchObject({
      prefix: "agent-tool-call",
      message: "agent tool call failed",
      toolName: "fuzzySearch",
      toolCallId: "call_failure",
    });
    expect(JSON.stringify(drainedEvents)).not.toContain("Reviewed strings");
  });
});
