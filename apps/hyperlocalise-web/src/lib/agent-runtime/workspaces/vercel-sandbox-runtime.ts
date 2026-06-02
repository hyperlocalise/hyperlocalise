import { Sandbox } from "@vercel/sandbox";

import { defaultVercelSandboxRuntime } from "@/lib/vercel-sandbox-config";

import type {
  GitWorkspaceSource,
  WorkspaceCommandResult,
  WorkspaceRuntime,
  WorkspaceSearchInput,
  WorkspaceSearchMatch,
  WorkspaceSnapshotRef,
} from "./types";

const defaultSandboxTimeoutMs = 10 * 60 * 1000;

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
    const result = await sandbox.runCommand(command, args);
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
  const sandbox = await Sandbox.create({
    ...(input.source ? { source: input.source } : {}),
    runtime: defaultVercelSandboxRuntime,
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
