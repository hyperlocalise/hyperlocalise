import type { ToolSet } from "ai";

import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { serializeErrorForLog } from "@/lib/serialize-error-for-log";

type ExecutableTool = {
  execute?: (input: unknown, options: unknown) => unknown;
};

type SafeRecord = Record<string, unknown>;

const MAX_OBJECT_KEYS = 20;
const MAX_ARRAY_SAMPLES = 3;
const MAX_DEPTH = 2;

const RAW_STRING_KEYS = new Set([
  "action",
  "fileFormat",
  "method",
  "sourceLocale",
  "subcommand",
  "targetLocale",
  "type",
]);

const PATH_KEY_RE = /(^|.*)(baseDir|configPath|filePath|path)$/;
const SENSITIVE_TEXT_KEY_RE = /content|instruction|message|pattern|prompt|query|summary|text/i;

function pathDepth(value: string): number {
  return value.split("/").filter(Boolean).length;
}

function pathBasename(value: string): string {
  return value.split("/").filter(Boolean).at(-1) ?? value;
}

function pathExtension(value: string): string | null {
  const name = pathBasename(value);
  const dotIndex = name.lastIndexOf(".");
  return dotIndex > 0 ? name.slice(dotIndex) : null;
}

function summarizePath(value: string): SafeRecord {
  return {
    basename: pathBasename(value),
    depth: pathDepth(value),
    extension: pathExtension(value),
  };
}

function summarizeCommand(value: string): SafeRecord {
  const tokens = value.trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  const unquote = (token: string) => token.replace(/^['"]|['"]$/g, "");
  const [bin, firstArg] = tokens.map(unquote);

  return {
    command: value,
    bin: bin ?? null,
    action: bin === "git" || bin === "hl" ? (firstArg ?? null) : null,
    argCount: Math.max(tokens.length - 1, 0),
  };
}

function summarizeString(value: string, key?: string): unknown {
  if (key === "command") {
    return summarizeCommand(value);
  }
  if (key && PATH_KEY_RE.test(key)) {
    return summarizePath(value);
  }
  if (key && RAW_STRING_KEYS.has(key)) {
    return value;
  }

  return {
    type: "string",
    length: value.length,
    sensitive: key ? SENSITIVE_TEXT_KEY_RE.test(key) : true,
  };
}

function isRecord(value: unknown): value is SafeRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizeMatchList(value: unknown[]): SafeRecord {
  return {
    type: "array",
    count: value.length,
    sample: value.slice(0, MAX_ARRAY_SAMPLES).map((item) => {
      if (!isRecord(item)) {
        return summarizeValue(item, undefined, MAX_DEPTH);
      }

      return {
        path: typeof item.path === "string" ? summarizeString(item.path, "path") : undefined,
        line: typeof item.line === "number" ? item.line : undefined,
        matchedText:
          typeof item.matchedText === "string"
            ? summarizeString(item.matchedText, "matchedText")
            : undefined,
        reason: typeof item.reason === "string" ? item.reason : undefined,
        score: typeof item.score === "number" ? item.score : undefined,
      };
    }),
  };
}

function summarizeFileList(value: unknown[]): SafeRecord {
  return {
    type: "array",
    count: value.length,
    sample: value.slice(0, MAX_ARRAY_SAMPLES).map((item) => {
      if (!isRecord(item) || typeof item.path !== "string") {
        return summarizeValue(item, undefined, MAX_DEPTH);
      }

      return {
        path: summarizeString(item.path, "path"),
      };
    }),
  };
}

function summarizeArray(value: unknown[], key?: string, depth = 0): unknown {
  if (key === "matches") {
    return summarizeMatchList(value);
  }
  if (key === "files") {
    return summarizeFileList(value);
  }

  return {
    type: "array",
    count: value.length,
    sample: value.slice(0, MAX_ARRAY_SAMPLES).map((item) => summarizeValue(item, key, depth + 1)),
  };
}

function summarizeObject(value: SafeRecord, depth: number): SafeRecord {
  const keys = Object.keys(value).slice(0, MAX_OBJECT_KEYS);
  if (depth >= MAX_DEPTH) {
    return {
      type: "object",
      keys,
      keyCount: Object.keys(value).length,
    };
  }

  return Object.fromEntries(keys.map((key) => [key, summarizeValue(value[key], key, depth + 1)]));
}

function summarizeValue(value: unknown, key?: string, depth = 0): unknown {
  if (typeof value === "string") {
    return summarizeString(value, key);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return summarizeArray(value, key, depth);
  }
  if (value instanceof Error) {
    return serializeErrorForLog(value);
  }
  if (isRecord(value)) {
    return summarizeObject(value, depth);
  }

  return { type: typeof value };
}

function summarizeToolContext(ctx: ToolContext): SafeRecord {
  const githubContext = ctx.githubContext;
  return {
    conversationId: ctx.conversationId,
    workflowRunId: ctx.workflowRunId ?? null,
    organizationId: ctx.organizationId,
    projectId: ctx.projectId ?? null,
    membershipRole: ctx.membershipRole,
    workMode: ctx.workMode ?? null,
    repositorySource: ctx.repositorySource ?? null,
    sandboxId: ctx.sandboxId ?? null,
    hasGithubContext: Boolean(githubContext),
    githubContext: githubContext
      ? {
          installationId: githubContext.installationId,
          pullRequestNumber: githubContext.pullRequestNumber ?? null,
          branch:
            typeof githubContext.branch === "string"
              ? summarizeString(githubContext.branch, "branch")
              : null,
          commitSha: githubContext.commitSha ? githubContext.commitSha.slice(0, 12) : null,
          commentId: githubContext.commentId ?? null,
        }
      : null,
  };
}

function summarizeResult(result: unknown): SafeRecord {
  if (!isRecord(result)) {
    return { value: summarizeValue(result) };
  }

  const summary = summarizeObject(result, 0);
  if (typeof result.success === "boolean") {
    summary.success = result.success;
  }
  if (typeof result.matchCount === "number") {
    summary.matchCount = result.matchCount;
  }
  if (typeof result.filesWithMatches === "number") {
    summary.filesWithMatches = result.filesWithMatches;
  }
  if (typeof result.scannedFiles === "number") {
    summary.scannedFiles = result.scannedFiles;
  }
  if (typeof result.count === "number") {
    summary.count = result.count;
  }
  if (typeof result.truncated === "boolean") {
    summary.truncated = result.truncated;
  }
  return summary;
}

function getToolCallId(options: unknown): string | null {
  if (!isRecord(options) || typeof options.toolCallId !== "string") {
    return null;
  }
  return options.toolCallId;
}

export function wrapToolWithLogging<T>(toolName: string, tool: T, ctx: ToolContext): T {
  const executableTool = tool as T & ExecutableTool;
  if (typeof executableTool.execute !== "function") {
    return tool;
  }

  const execute = executableTool.execute.bind(tool);
  return {
    ...tool,
    execute: async (input: unknown, options: unknown) => {
      const startedAt = Date.now();
      const baseEvent = {
        toolName,
        toolCallId: getToolCallId(options),
        context: summarizeToolContext(ctx),
      };

      console.log("agent tool call started", {
        ...baseEvent,
        input: summarizeValue(input),
      });

      try {
        const result = await execute(input, options);
        console.log("agent tool call completed", {
          ...baseEvent,
          durationMs: Date.now() - startedAt,
          result: summarizeResult(result),
        });
        return result;
      } catch (error) {
        console.log("agent tool call failed", {
          ...baseEvent,
          durationMs: Date.now() - startedAt,
          err: serializeErrorForLog(error),
        });
        throw error;
      }
    },
  };
}

export function wrapToolSetWithLogging(tools: ToolSet, ctx: ToolContext): ToolSet {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [name, wrapToolWithLogging(name, tool, ctx)]),
  ) as ToolSet;
}
