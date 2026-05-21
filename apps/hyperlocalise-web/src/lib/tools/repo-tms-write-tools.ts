import { tool } from "ai";
import { z } from "zod";
import { Sandbox } from "@vercel/sandbox";

import { schema } from "@/lib/database";
import { getFileStorageAdapter } from "@/lib/file-storage";
import {
  createRepositorySourceFileVersion,
  createStoredFile,
  normalizeSourcePath,
} from "@/lib/file-storage/records";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";
import type { ToolContext } from "./types";
import {
  canPushToGitHubBranch,
  checkRepoTmsWriteGate,
  type WriteAction,
} from "@/lib/agents/repo-tms-write-gate";

async function logMutation(
  ctx: ToolContext,
  input: {
    action: WriteAction;
    status: "pending" | "approved" | "denied" | "completed" | "failed";
    details?: {
      changedPaths?: string[];
      commands?: string[];
      error?: string;
      reason?: string;
    };
  },
) {
  const taskId = ctx.conversationId;
  await ctx.db.insert(schema.repoTmsMutationLogs).values({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    workflowRunId: ctx.conversationId,
    taskId,
    actor: {
      sourceUserId: ctx.actor?.sourceUserId ?? "unknown",
      userId: ctx.actor?.userId,
      email: ctx.actor?.email,
      displayName: ctx.actor?.displayName,
      role: ctx.actor?.role,
    },
    action: input.action,
    source: ctx.actor ? "repo_tms_agent" : "unknown",
    provider: ctx.githubContext ? "github" : "tms",
    status: input.status,
    details: input.details ?? {},
  });
}

function assertWriteAllowed(ctx: ToolContext, action: WriteAction) {
  if (!ctx.workMode || !ctx.repoTmsSource || !ctx.actor) {
    return {
      allowed: false as const,
      reason: "Write context is not available for this tool.",
    };
  }

  return checkRepoTmsWriteGate({
    workMode: ctx.workMode,
    source: ctx.repoTmsSource,
    actor: ctx.actor,
    action,
  });
}

async function runSandboxCommand(
  sandboxId: string,
  command: string,
  args: string[],
): Promise<{ exitCode: number; output: string }> {
  const sandbox = await Sandbox.get({ sandboxId });
  const result = await sandbox.runCommand(command, args);
  return {
    exitCode: result.exitCode,
    output: await result.output("both"),
  };
}

function sourceFilename(path: string) {
  const normalizedPath = normalizeSourcePath(path);
  return normalizedPath.split("/").filter(Boolean).at(-1) ?? normalizedPath;
}

function sourceContentType(path: string) {
  const format = inferSupportedFileTranslationFileFormat(path);
  switch (format) {
    case "json":
    case "jsonc":
    case "arb":
      return "application/json";
    case "xliff":
      return "application/xliff+xml";
    case "po":
    case "strings":
    case "stringsdict":
      return "text/plain";
    case "html":
      return "text/html";
    case "markdown":
    case "mdx":
      return "text/markdown";
    case "csv":
      return "text/csv";
    default:
      return "application/octet-stream";
  }
}

/**
 * Apply Hyperlocalise fixes in the repository sandbox.
 */
export function createApplyHyperlocaliseFixesTool(ctx: ToolContext) {
  return tool({
    description:
      "Apply Hyperlocalise automated fixes to translation files in the checked-out repository sandbox.",
    inputSchema: z.object({
      scope: z
        .enum(["all", "missing", "whitespace", "placeholders", "html"])
        .optional()
        .describe("Optional fix scope. Defaults to 'all'."),
    }),
    execute: async (input) => {
      const gate = assertWriteAllowed(ctx, "apply_fixes");
      if (!gate.allowed) {
        await logMutation(ctx, {
          action: "apply_fixes",
          status: "denied",
          details: { reason: gate.reason },
        });
        return { success: false, error: gate.reason };
      }

      if (!ctx.sandboxId) {
        return {
          success: false,
          error: "No repository sandbox is available. Cannot apply fixes.",
        };
      }

      const scopeArg = input.scope ?? "all";
      const args = ["fix", "--no-fail", "--scope", scopeArg];

      try {
        const result = await runSandboxCommand(ctx.sandboxId, "bash", [
          "-lc",
          `export PATH="$HOME/.local/bin:$PATH"; hl ${args.map((a) => `'${a.replaceAll("'", "'\\''")}'`).join(" ")}`,
        ]);

        if (result.exitCode !== 0) {
          await logMutation(ctx, {
            action: "apply_fixes",
            status: "failed",
            details: { error: result.output },
          });
          return { success: false, error: `Fix command failed: ${result.output}` };
        }

        await logMutation(ctx, {
          action: "apply_fixes",
          status: "completed",
          details: { commands: [`hl ${args.join(" ")}`] },
        });

        return { success: true, output: result.output };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await logMutation(ctx, {
          action: "apply_fixes",
          status: "failed",
          details: { error: message },
        });
        return { success: false, error: message };
      }
    },
  });
}

/**
 * Commit changed files in the repository sandbox.
 */
export function createCommitChangesTool(ctx: ToolContext) {
  return tool({
    description:
      "Commit changed translation files in the checked-out repository sandbox with a standard i18n fix message.",
    inputSchema: z.object({
      message: z
        .string()
        .optional()
        .describe("Optional custom commit message. Defaults to a standard i18n fix message."),
    }),
    execute: async (input) => {
      const gate = assertWriteAllowed(ctx, "commit_changes");
      if (!gate.allowed) {
        await logMutation(ctx, {
          action: "commit_changes",
          status: "denied",
          details: { reason: gate.reason },
        });
        return { success: false, error: gate.reason };
      }

      if (!ctx.sandboxId) {
        return {
          success: false,
          error: "No repository sandbox is available. Cannot commit changes.",
        };
      }

      const commitMessage = input.message ?? "fix(i18n): apply hyperlocalise fixes";

      try {
        const statusResult = await runSandboxCommand(ctx.sandboxId, "git", [
          "status",
          "--porcelain=v1",
          "-z",
          "--untracked-files=all",
        ]);

        if (statusResult.exitCode !== 0) {
          return { success: false, error: `git status failed: ${statusResult.output}` };
        }

        const changedPaths = getCommittableChangedPaths(statusResult.output);
        if (changedPaths.length === 0) {
          return { success: true, changed: false, message: "No changes to commit." };
        }

        const addResult = await runSandboxCommand(ctx.sandboxId, "git", [
          "add",
          "--",
          ...changedPaths,
        ]);
        if (addResult.exitCode !== 0) {
          await logMutation(ctx, {
            action: "commit_changes",
            status: "failed",
            details: { error: addResult.output, changedPaths },
          });
          return { success: false, error: `git add failed: ${addResult.output}` };
        }

        const commitResult = await runSandboxCommand(ctx.sandboxId, "git", [
          "commit",
          "-m",
          commitMessage,
        ]);
        if (commitResult.exitCode !== 0) {
          await logMutation(ctx, {
            action: "commit_changes",
            status: "failed",
            details: { error: commitResult.output, changedPaths },
          });
          return { success: false, error: `git commit failed: ${commitResult.output}` };
        }

        await logMutation(ctx, {
          action: "commit_changes",
          status: "completed",
          details: { changedPaths, commands: ["git add", "git commit"] },
        });

        return { success: true, changed: true, changedPaths };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await logMutation(ctx, {
          action: "commit_changes",
          status: "failed",
          details: { error: message },
        });
        return { success: false, error: message };
      }
    },
  });
}

/**
 * Push committed changes to the PR branch.
 */
export function createPushToBranchTool(ctx: ToolContext) {
  return tool({
    description:
      "Push committed changes from the repository sandbox to the GitHub pull request branch.",
    inputSchema: z.object({}),
    execute: async () => {
      const gate = assertWriteAllowed(ctx, "push_to_branch");
      if (!gate.allowed) {
        await logMutation(ctx, {
          action: "push_to_branch",
          status: "denied",
          details: { reason: gate.reason },
        });
        return { success: false, error: gate.reason };
      }

      if (!ctx.sandboxId) {
        return {
          success: false,
          error: "No repository sandbox is available. Cannot push changes.",
        };
      }

      if (!ctx.githubContext) {
        return {
          success: false,
          error: "No GitHub context is available. Cannot determine the target branch.",
        };
      }

      const branch = ctx.githubContext.branch;
      if (!branch) {
        return {
          success: false,
          error: "No branch is configured in the GitHub context. Cannot push.",
        };
      }

      const pushCheck = await canPushToGitHubBranch({
        installationId: ctx.githubContext.installationId,
        repositoryFullName: ctx.githubContext.repositoryFullName,
        branch,
      });

      if (!pushCheck.canPush) {
        await logMutation(ctx, {
          action: "push_to_branch",
          status: "denied",
          details: { reason: pushCheck.reason },
        });
        return {
          success: false,
          error: pushCheck.reason ?? "Push to this branch is not permitted.",
        };
      }

      try {
        const pushResult = await runSandboxCommand(ctx.sandboxId, "git", [
          "push",
          "origin",
          `HEAD:refs/heads/${branch}`,
        ]);

        if (pushResult.exitCode !== 0) {
          await logMutation(ctx, {
            action: "push_to_branch",
            status: "failed",
            details: { error: pushResult.output },
          });
          return { success: false, error: `git push failed: ${pushResult.output}` };
        }

        await logMutation(ctx, {
          action: "push_to_branch",
          status: "completed",
          details: { commands: [`git push origin HEAD:refs/heads/${branch}`] },
        });

        return { success: true, branch };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await logMutation(ctx, {
          action: "push_to_branch",
          status: "failed",
          details: { error: message },
        });
        return { success: false, error: message };
      }
    },
  });
}

/**
 * Upload source files from the repository sandbox to Hyperlocalise.
 */
export function createUploadSourcesTool(ctx: ToolContext) {
  return tool({
    description:
      "Upload source translation files from the checked-out repository sandbox to Hyperlocalise for the current project.",
    inputSchema: z.object({
      paths: z
        .array(z.string())
        .min(1)
        .describe("Relative paths to source translation files in the sandbox."),
    }),
    execute: async (input) => {
      const gate = assertWriteAllowed(ctx, "upload_sources");
      if (!gate.allowed) {
        await logMutation(ctx, {
          action: "upload_sources",
          status: "denied",
          details: { reason: gate.reason },
        });
        return { success: false, error: gate.reason };
      }

      if (!ctx.projectId) {
        return {
          success: false,
          error: "No project is attached to this workflow. Upload requires a project.",
        };
      }

      if (!ctx.sandboxId) {
        return {
          success: false,
          error: "No repository sandbox is available. Cannot upload sources.",
        };
      }

      try {
        const adapter = getFileStorageAdapter();
        const uploaded: Array<{ path: string; fileId: string; sourceFileVersionId: string }> = [];
        for (const path of input.paths) {
          const normalizedPath = normalizeSourcePath(path);
          if (!inferSupportedFileTranslationFileFormat(normalizedPath)) {
            return {
              success: false,
              error: `Unsupported source file format for ${path}.`,
            };
          }

          const result = await runSandboxCommand(ctx.sandboxId, "cat", [path]);
          if (result.exitCode !== 0) {
            await logMutation(ctx, {
              action: "upload_sources",
              status: "failed",
              details: { error: `Failed to read ${path}: ${result.output}` },
            });
            return { success: false, error: `Failed to read ${path}: ${result.output}` };
          }

          let uploadedFile: typeof schema.storedFiles.$inferSelect | null = null;
          const { storedFile, version } = await ctx.db
            .transaction(async (tx) => {
              uploadedFile = await createStoredFile({
                organizationId: ctx.organizationId,
                projectId: ctx.projectId,
                createdByUserId: ctx.actor?.userId ?? null,
                role: "source",
                sourceKind: "repository_file",
                filename: sourceFilename(normalizedPath),
                contentType: sourceContentType(normalizedPath),
                content: Buffer.from(result.output),
                metadata: {
                  sourcePath: normalizedPath,
                  commitSha: ctx.githubContext?.commitSha,
                  workflowRunId: ctx.conversationId,
                  uploadSurface: "repo_tms_agent",
                },
                adapter,
                db: tx,
              });

              const version = await createRepositorySourceFileVersion({
                storedFile: uploadedFile,
                sourcePath: normalizedPath,
                commitSha: ctx.githubContext?.commitSha,
                workflowRunId: ctx.conversationId,
                uploadedByUserId: ctx.actor?.userId,
                uploadSurface: "repo_tms_agent",
                db: tx,
              });

              return { storedFile: uploadedFile, version };
            })
            .catch(async (error) => {
              if (uploadedFile) {
                await adapter.delete({ keyOrUrl: uploadedFile.storageKey }).catch(() => {});
              }
              throw error;
            });

          uploaded.push({
            path: normalizedPath,
            fileId: storedFile.id,
            sourceFileVersionId: version.id,
          });
        }

        await logMutation(ctx, {
          action: "upload_sources",
          status: "completed",
          details: { changedPaths: uploaded.map((file) => file.path) },
        });

        return {
          success: true,
          uploaded,
          message: `Uploaded ${uploaded.length} source file(s) to project ${ctx.projectId}.`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await logMutation(ctx, {
          action: "upload_sources",
          status: "failed",
          details: { error: message },
        });
        return { success: false, error: message };
      }
    },
  });
}

export function getCommittableChangedPaths(statusOutput: string): string[] {
  const paths: string[] = [];
  const entries = statusOutput.split("\0");
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) {
      continue;
    }

    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    const isRenameOrCopy = status[0] === "R" || status[0] === "C";
    if (!path || status === "!!" || isInternalReportPath(path)) {
      if (isRenameOrCopy) {
        index += 1;
      }
      continue;
    }

    paths.push(path);
    if (isRenameOrCopy) {
      index += 1;
    }
  }
  return paths;
}

function isInternalReportPath(path: string): boolean {
  return path === ".hyperlocalise" || path.startsWith(".hyperlocalise/");
}
