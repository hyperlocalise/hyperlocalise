import { Sandbox } from "@vercel/sandbox";

import { createConfiguredVercelSandbox } from "@/lib/vercel-sandbox-config";

import type {
  GitWorkspaceSource,
  WorkspaceCommandResult,
  WorkspaceRuntime,
  WorkspaceSearchInput,
  WorkspaceSearchMatch,
  WorkspaceSnapshotRef,
} from "./types";

const defaultSandboxTimeoutMs = 10 * 60 * 1000;

export class VercelSandboxCommandError extends Error {
  readonly command: string;
  readonly argCount: number;
  readonly argFlags: string[];
  readonly sandboxId: string;
  readonly responseStatus?: number;
  readonly responseStatusText?: string;
  readonly responseUrl?: string;
  readonly providerErrorCode?: string;
  readonly providerErrorMessage?: string;
  readonly providerRequestId?: string;

  constructor(input: { sandboxId: string; command: string; args: string[]; cause: unknown }) {
    const details = extractVercelSandboxErrorDetails(input.cause);
    const argFlags = extractSafeArgFlags(input.args);
    super(
      `Vercel sandbox command failed: ${input.command} ` +
        `(sandboxId=${input.sandboxId}, args=${input.args.length}` +
        `${details.responseStatus ? `, status=${details.responseStatus}` : ""}` +
        `${details.providerErrorCode ? `, providerErrorCode=${details.providerErrorCode}` : ""})`,
      { cause: input.cause },
    );
    this.name = "VercelSandboxCommandError";
    this.command = input.command;
    this.argCount = input.args.length;
    this.argFlags = argFlags;
    this.sandboxId = input.sandboxId;
    this.responseStatus = details.responseStatus;
    this.responseStatusText = details.responseStatusText;
    this.responseUrl = details.responseUrl;
    this.providerErrorCode = details.providerErrorCode;
    this.providerErrorMessage = details.providerErrorMessage;
    this.providerRequestId = details.providerRequestId;
  }
}

const maxLoggedArgFlags = 24;

function extractSafeArgFlags(args: string[]): string[] {
  const flags: string[] = [];
  const seen = new Set<string>();

  for (const arg of args) {
    if (!/^-{1,2}[A-Za-z]/.test(arg)) {
      continue;
    }

    const flag = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (seen.has(flag)) {
      continue;
    }

    flags.push(flag);
    seen.add(flag);
    if (flags.length >= maxLoggedArgFlags) {
      break;
    }
  }

  return flags;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

function extractVercelSandboxErrorDetails(error: unknown) {
  if (!isRecord(error)) {
    return {};
  }

  const response = isRecord(error.response) ? error.response : undefined;
  const json = isRecord(error.json) ? error.json : undefined;
  const providerError = json && isRecord(json.error) ? json.error : undefined;

  return {
    responseStatus:
      numberField(error, "responseStatus") ??
      (response ? numberField(response, "status") : undefined),
    responseStatusText:
      stringField(error, "responseStatusText") ??
      (response ? stringField(response, "statusText") : undefined),
    responseUrl:
      stringField(error, "responseUrl") ?? (response ? stringField(response, "url") : undefined),
    providerErrorCode:
      (providerError ? stringField(providerError, "code") : undefined) ??
      stringField(error, "code"),
    providerErrorMessage:
      (providerError ? stringField(providerError, "message") : undefined) ??
      stringField(error, "message"),
    providerRequestId:
      (providerError ? stringField(providerError, "requestId") : undefined) ??
      (providerError ? stringField(providerError, "request_id") : undefined) ??
      stringField(error, "requestId") ??
      stringField(error, "request_id"),
  };
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export class VercelSandboxRuntime implements WorkspaceRuntime {
  constructor(readonly id: string) {}

  async runCommand(
    command: string,
    args: string[],
    options: { output?: "both" | "stdout" } = {},
  ): Promise<WorkspaceCommandResult> {
    const sandbox = await Sandbox.get({ name: this.id });
    let result;
    try {
      result = await sandbox.runCommand(command, args);
    } catch (error) {
      throw new VercelSandboxCommandError({
        sandboxId: this.id,
        command,
        args,
        cause: error,
      });
    }
    return {
      exitCode: result.exitCode,
      output: await result.output(options.output ?? "both"),
    };
  }

  async readFile(path: string): Promise<string> {
    const guard = await this.runCommand(
      "bash",
      [
        "-lc",
        `set -euo pipefail; target=${shellQuote(path)}; if [ -L "$target" ]; then exit 42; fi; resolved=$(readlink -f "$target" 2>/dev/null || true); if [ -z "$resolved" ] || [ ! -f "$resolved" ]; then exit 43; fi; case "$resolved" in /etc/*|/proc/*|/sys/*|/var/*|/root/*|/home/*/.ssh/*) exit 44;; esac; cat "$resolved"`,
      ],
      { output: "stdout" },
    );

    if (guard.exitCode === 42) {
      throw new Error("Symlink reads are not allowed.");
    }
    if (guard.exitCode === 43) {
      throw new Error(`Failed to read ${path}`);
    }
    if (guard.exitCode === 44) {
      throw new Error("Path resolves outside the workspace.");
    }
    if (guard.exitCode !== 0) {
      throw new Error(guard.output || `Failed to read ${path}`);
    }

    return guard.output;
  }

  async writeFile(path: string, content: string | Buffer): Promise<void> {
    const encoded = Buffer.from(content).toString("base64");
    const result = await this.runCommand("bash", [
      "-lc",
      `mkdir -p "$(dirname ${shellQuote(path)})" && printf %s ${shellQuote(encoded)} | base64 -d > ${shellQuote(path)}`,
    ]);
    if (result.exitCode !== 0) {
      throw new Error(result.output || `Failed to write ${path}`);
    }
  }

  async search(input: WorkspaceSearchInput): Promise<WorkspaceSearchMatch[]> {
    const result = await this.runCommand("grep", [
      "-r",
      "-n",
      "-F",
      "--exclude-dir=node_modules",
      "--exclude-dir=.git",
      input.pattern,
      input.path ?? ".",
    ]);
    if (result.exitCode >= 2) {
      throw new Error(result.output || "Search command failed");
    }

    return result.output
      .split("\n")
      .filter(Boolean)
      .slice(0, input.maxResults ?? 100)
      .flatMap((line) => {
        const first = line.indexOf(":");
        const second = line.indexOf(":", first + 1);
        if (first === -1 || second === -1) {
          return [];
        }
        return [
          {
            path: line.slice(0, first),
            lineNum: Number(line.slice(first + 1, second)),
            line: line.slice(second + 1),
          },
        ];
      });
  }

  async snapshot(): Promise<WorkspaceSnapshotRef> {
    throw new Error("Vercel sandbox snapshot support is not wired into WorkspaceRuntime yet.");
  }

  async restore(_snapshot: WorkspaceSnapshotRef): Promise<void> {
    throw new Error("Vercel sandbox restore support is not wired into WorkspaceRuntime yet.");
  }

  async stop(): Promise<void> {
    const sandbox = await Sandbox.get({ name: this.id });
    await sandbox.stop();
  }
}

export async function createVercelSandboxWorkspace(input: {
  source?: GitWorkspaceSource;
  timeoutMs?: number;
}): Promise<WorkspaceRuntime> {
  const sandbox = await createConfiguredVercelSandbox({
    ...(input.source ? { source: input.source } : {}),
    timeout: input.timeoutMs ?? defaultSandboxTimeoutMs,
  });

  return new VercelSandboxRuntime(sandbox.name);
}

export function getVercelSandboxWorkspace(sandboxId: string): WorkspaceRuntime {
  return new VercelSandboxRuntime(sandboxId);
}

export async function stopWorkspace(workspaceId: string): Promise<void> {
  await getVercelSandboxWorkspace(workspaceId).stop();
}
