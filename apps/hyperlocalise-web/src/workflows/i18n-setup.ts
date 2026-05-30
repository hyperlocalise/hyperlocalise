import { Sandbox } from "@vercel/sandbox";
import { ToolLoopAgent, type ModelMessage, type ToolSet } from "ai";
import { getWorkflowMetadata } from "workflow";

import { buildSuggestedI18nConfigYaml } from "@/lib/agents/i18n-setup/merge-i18n-config";
import {
  detectLocaleFiles,
  isIgnoredLocaleScanPath,
} from "@/lib/agents/i18n-setup/locale-detection";
import type {
  I18nSetupRequestedEventData,
  I18nSetupWorkflowResult,
} from "@/lib/agents/i18n-setup/i18n-setup-task";
import {
  buildHyperlocaliseAgentInstructions,
  getHyperlocaliseAgentModel,
} from "@/lib/agent-runtime/loops/hyperlocalise-agent";
import {
  filterToolSetByNames,
  repositoryWorkflowToolNames,
} from "@/lib/agent-runtime/tools/manifest";
import { buildTools } from "@/lib/agent-runtime/tools/registry";
import { createWriteI18nConfigTool } from "@/lib/agent-runtime/tools/i18n-setup-tools";
import { getInstallationOctokit } from "@/lib/agents/github/app";
import { canPushToGitHubRepository } from "@/lib/agents/repository-write-gate";
import { db, schema } from "@/lib/database";
import { getLocaleScanExtensions } from "@/lib/translation/file-formats";
import { ensureAgentSession } from "@/lib/tools/types";
import type { ToolContext } from "@/lib/tools/types";
import { eq } from "drizzle-orm";

const sandboxTimeoutMs = 10 * 60 * 1000;
const agentStepLimit = 20;

type InstallationAuth = {
  token: string;
};

const translationExtensions = getLocaleScanExtensions();

type ExistingConfigState = { kind: "none" } | { kind: "jsonc" } | { kind: "yml"; content: string };

async function updateRunStatusStep(
  runId: string,
  input: {
    status: "queued" | "running" | "succeeded" | "failed";
    errorCode?: string;
    errorMessage?: string;
    pullRequestUrl?: string;
    pullRequestNumber?: number;
    detectedLocaleCount?: number;
    workflowRunId?: string;
  },
): Promise<void> {
  "use step";

  await db
    .update(schema.githubI18nSetupRuns)
    .set({
      status: input.status,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      pullRequestUrl: input.pullRequestUrl ?? null,
      pullRequestNumber: input.pullRequestNumber ?? null,
      detectedLocaleCount: input.detectedLocaleCount ?? null,
      workflowRunId: input.workflowRunId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.githubI18nSetupRuns.id, runId));
}

async function createSetupSandbox(
  event: I18nSetupRequestedEventData,
): Promise<{ sandboxId: string; token: string }> {
  "use step";

  const octokit = await getInstallationOctokit(event.installationId);
  const { token } = (await octokit.auth({ type: "installation" })) as InstallationAuth;
  const sandbox = await Sandbox.create({
    source: {
      depth: 1,
      password: token,
      revision: event.baseBranch,
      type: "git",
      url: `https://github.com/${event.repositoryFullName}.git`,
      username: "x-access-token",
    },
    timeout: sandboxTimeoutMs,
  });

  return { sandboxId: sandbox.name, token };
}

async function stopSetupSandbox(sandboxId: string): Promise<void> {
  "use step";

  const sandbox = await Sandbox.get({ name: sandboxId });
  await sandbox.stop();
}

async function runSandboxCommand(
  sandboxId: string,
  command: string,
  args: string[],
): Promise<{ exitCode: number; output: string }> {
  const sandbox = await Sandbox.get({ name: sandboxId });
  const result = await sandbox.runCommand(command, args);
  return {
    exitCode: result.exitCode,
    output: await result.output("both"),
  };
}

async function prepareSandbox(
  sandboxId: string,
  event: I18nSetupRequestedEventData,
  token: string,
): Promise<void> {
  "use step";

  const remote = `https://github.com/${event.repositoryFullName}.git`;

  for (const [command, args] of [
    ["git", ["config", "user.name", "hyperlocalise[bot]"]],
    ["git", ["config", "user.email", "hyperlocalise[bot]@users.noreply.github.com"]],
    ["git", ["config", "credential.helper", "store"]],
    ["bash", ["-lc", `echo "https://x-access-token:${token}@github.com" > ~/.git-credentials`]],
    ["git", ["remote", "set-url", "origin", remote]],
  ] satisfies Array<[string, string[]]>) {
    const result = await runSandboxCommand(sandboxId, command, args);
    if (result.exitCode !== 0) {
      throw new Error(`sandbox setup failed: ${result.output}`);
    }
  }
}

async function resolveExistingConfig(sandboxId: string): Promise<ExistingConfigState> {
  "use step";

  const jsoncResult = await runSandboxCommand(sandboxId, "test", ["-f", "i18n.jsonc"]);
  if (jsoncResult.exitCode === 0) {
    return { kind: "jsonc" };
  }

  const ymlResult = await runSandboxCommand(sandboxId, "test", ["-f", "i18n.yml"]);
  if (ymlResult.exitCode !== 0) {
    return { kind: "none" };
  }

  const readResult = await runSandboxCommand(sandboxId, "cat", ["i18n.yml"]);
  if (readResult.exitCode !== 0) {
    throw new Error(`failed to read i18n.yml: ${readResult.output}`);
  }

  return { kind: "yml", content: readResult.output };
}

async function scanLocaleFilePaths(sandboxId: string): Promise<string[]> {
  "use step";

  const namePatterns = translationExtensions.map((ext) => `-name '*.${ext}'`).join(" -o ");
  const findArgs = [
    "-lc",
    `find . -type f \\( ${namePatterns} \\) ! -path './.git/*' ! -path './node_modules/*' ! -path './.next/*' ! -path './dist/*' ! -path './build/*' | sed 's|^\\./||'`,
  ];

  const result = await runSandboxCommand(sandboxId, "bash", findArgs);
  if (result.exitCode !== 0) {
    throw new Error(`locale scan failed: ${result.output}`);
  }

  return result.output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((path) => !isIgnoredLocaleScanPath(path));
}

async function runSetupAgentStep(input: {
  event: I18nSetupRequestedEventData;
  sandboxId: string;
  suggestedConfig: string;
  detectedLocaleCount: number;
  mode: "create" | "update";
}): Promise<{ wroteConfig: boolean; summary: string }> {
  "use step";

  const { workflowRunId } = getWorkflowMetadata();
  const toolContext: ToolContext = {
    conversationId: input.event.runId,
    agentSession: { todos: [] },
    workflowRunId,
    organizationId: input.event.organizationId,
    localUserId: input.event.actorUserId,
    membershipRole: "admin",
    projectId: null,
    db,
    workMode: "write",
    repositorySource: "chat_ui",
    actor: {
      sourceUserId: input.event.actorUserId,
      userId: input.event.actorUserId,
      role: "admin",
    },
    sandboxId: input.sandboxId,
    githubContext: {
      resolved: true,
      installationId: input.event.installationId,
      repositoryFullName: input.event.repositoryFullName,
      branch: input.event.baseBranch,
    },
  };

  ensureAgentSession(toolContext);

  const baseTools = filterToolSetByNames(buildTools(toolContext), [
    ...repositoryWorkflowToolNames,
  ]) as ToolSet;

  const tools: ToolSet = {
    ...baseTools,
    writeI18nConfig: createWriteI18nConfigTool(toolContext, {
      allowUpdate: input.mode === "update",
    }),
  };

  const goal =
    input.mode === "update"
      ? "update the existing i18n.yml with newly discovered locale files"
      : "create i18n.yml for this repository based on discovered locale files";

  const agent = new ToolLoopAgent({
    model: getHyperlocaliseAgentModel(),
    tools,
    stopWhen: [(step) => step.steps.length >= agentStepLimit],
    instructions: buildHyperlocaliseAgentInstructions({
      surface: "web",
      projectId: null,
      additionalInstructions: [
        "You are running the Hyperlocalise i18n setup wizard.",
        `Goal: ${goal}.`,
        `Detected ${input.detectedLocaleCount} candidate locale file(s) across supported formats (JSON, YAML, PO, XLIFF, ARB, .strings, .xcstrings, and more).`,
        "Steps:",
        input.mode === "update"
          ? "1. Use detectRepoConfig and read to review the existing i18n.yml."
          : "1. Use detectRepoConfig to confirm i18n.yml does not already exist.",
        "2. Use glob/grep/read only if you need to validate locale file patterns.",
        "3. Call writeI18nConfig exactly once with the final YAML content.",
        "Do not commit, push, or create pull requests yourself.",
        "Suggested starter config based on deterministic detection:",
        input.suggestedConfig,
      ].join("\n\n"),
    }),
    experimental_context: { sandboxId: input.sandboxId, i18nSetupRunId: input.event.runId },
  });

  const result = await agent.generate({
    messages: [
      {
        role: "user",
        content: "Analyze the repository locale files and write i18n.yml using writeI18nConfig.",
      },
    ] as ModelMessage[],
  });

  const wroteConfigResult = await runSandboxCommand(input.sandboxId, "test", ["-f", "i18n.yml"]);
  return {
    wroteConfig: wroteConfigResult.exitCode === 0,
    summary: result.text.trim() || "Completed i18n setup analysis.",
  };
}

function buildBranchName(): string {
  const suffix = Date.now().toString(36);
  return `hyperlocalise/i18n-setup-${suffix}`;
}

async function commitPushAndCreatePullRequest(input: {
  event: I18nSetupRequestedEventData;
  sandboxId: string;
  branchName: string;
  summary: string;
  mode: "create" | "update";
}): Promise<{ pullRequestUrl: string; pullRequestNumber: number }> {
  "use step";

  const pushCheck = await canPushToGitHubRepository({
    installationId: input.event.installationId,
    repositoryFullName: input.event.repositoryFullName,
  });

  if (!pushCheck.canPush) {
    throw new Error(pushCheck.reason ?? "Cannot push to repository.");
  }

  const commitMessage =
    input.mode === "update"
      ? "chore(i18n): update Hyperlocalise i18n.yml"
      : "chore(i18n): add Hyperlocalise i18n.yml";
  const pullRequestTitle = commitMessage;

  for (const [command, args] of [
    ["git", ["checkout", "-b", input.branchName]],
    ["git", ["add", "i18n.yml"]],
    ["git", ["commit", "-m", commitMessage]],
    ["git", ["push", "-u", "origin", input.branchName]],
  ] satisfies Array<[string, string[]]>) {
    const result = await runSandboxCommand(input.sandboxId, command, args);
    if (result.exitCode !== 0) {
      throw new Error(`git command failed: ${result.output}`);
    }
  }

  const octokit = await getInstallationOctokit(input.event.installationId);
  const prBodyIntro =
    input.mode === "update"
      ? "This pull request updates `i18n.yml` with newly discovered locale files."
      : "This pull request adds an `i18n.yml` generated by the Hyperlocalise i18n setup wizard.";
  const { data: pullRequest } = await octokit.rest.pulls.create({
    owner: input.event.repositoryOwner,
    repo: input.event.repositoryName,
    title: pullRequestTitle,
    head: input.branchName,
    base: input.event.baseBranch,
    body: [
      "## Hyperlocalise i18n setup",
      "",
      prBodyIntro,
      "",
      "Please review locale mappings and LLM provider settings before merging.",
      "",
      input.summary ? `Agent summary:\n\n${input.summary}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return {
    pullRequestUrl: pullRequest.html_url,
    pullRequestNumber: pullRequest.number,
  };
}

export async function i18nSetupWorkflow(
  event: I18nSetupRequestedEventData,
): Promise<I18nSetupWorkflowResult> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  let sandboxId: string | null = null;

  try {
    await updateRunStatusStep(event.runId, {
      status: "running",
      workflowRunId,
    });

    const { sandboxId: createdSandboxId, token } = await createSetupSandbox(event);
    sandboxId = createdSandboxId;

    await prepareSandbox(sandboxId, event, token);

    const existingConfig = await resolveExistingConfig(sandboxId);
    if (existingConfig.kind === "jsonc") {
      const message =
        "This repository uses i18n.jsonc. The setup wizard currently creates or updates i18n.yml only.";
      await updateRunStatusStep(event.runId, {
        status: "failed",
        errorCode: "i18n_jsonc_not_supported",
        errorMessage: message,
        workflowRunId,
      });
      return {
        ok: false,
        runId: event.runId,
        status: "failed",
        errorCode: "i18n_jsonc_not_supported",
        errorMessage: message,
      };
    }

    const scannedPaths = await scanLocaleFilePaths(sandboxId);
    const detection = detectLocaleFiles(scannedPaths);

    if (!detection) {
      const message =
        "Could not find locale translation files in this repository. Look for paths like locales/en-US.json, locales/fr.po, or messages/de.yaml.";
      await updateRunStatusStep(event.runId, {
        status: "failed",
        errorCode: "locale_files_not_found",
        errorMessage: message,
        workflowRunId,
      });
      return {
        ok: false,
        runId: event.runId,
        status: "failed",
        errorCode: "locale_files_not_found",
        errorMessage: message,
      };
    }

    const suggestion = buildSuggestedI18nConfigYaml(
      detection,
      existingConfig.kind === "yml" ? existingConfig.content : null,
    );

    if (suggestion.mode === "update" && !suggestion.hasChanges) {
      const message = "i18n.yml is already up to date with discovered locale files.";
      await updateRunStatusStep(event.runId, {
        status: "succeeded",
        errorMessage: message,
        detectedLocaleCount: detection.allFiles.length,
        workflowRunId,
      });
      return {
        ok: true,
        runId: event.runId,
        status: "succeeded",
        detectedLocaleCount: detection.allFiles.length,
        errorMessage: message,
      };
    }

    const agentResult = await runSetupAgentStep({
      event,
      sandboxId,
      suggestedConfig: suggestion.yaml,
      detectedLocaleCount: detection.allFiles.length,
      mode: suggestion.mode,
    });

    if (!agentResult.wroteConfig) {
      const message = "The setup agent did not write i18n.yml to the repository.";
      await updateRunStatusStep(event.runId, {
        status: "failed",
        errorCode: "i18n_config_not_written",
        errorMessage: message,
        detectedLocaleCount: detection.allFiles.length,
        workflowRunId,
      });
      return {
        ok: false,
        runId: event.runId,
        status: "failed",
        errorCode: "i18n_config_not_written",
        errorMessage: message,
        detectedLocaleCount: detection.allFiles.length,
      };
    }

    const branchName = buildBranchName();
    const pullRequest = await commitPushAndCreatePullRequest({
      event,
      sandboxId,
      branchName,
      summary: agentResult.summary,
      mode: suggestion.mode,
    });

    await updateRunStatusStep(event.runId, {
      status: "succeeded",
      pullRequestUrl: pullRequest.pullRequestUrl,
      pullRequestNumber: pullRequest.pullRequestNumber,
      detectedLocaleCount: detection.allFiles.length,
      workflowRunId,
    });

    return {
      ok: true,
      runId: event.runId,
      status: "succeeded",
      pullRequestUrl: pullRequest.pullRequestUrl,
      pullRequestNumber: pullRequest.pullRequestNumber,
      detectedLocaleCount: detection.allFiles.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRunStatusStep(event.runId, {
      status: "failed",
      errorCode: "i18n_setup_failed",
      errorMessage: message,
      workflowRunId,
    });
    return {
      ok: false,
      runId: event.runId,
      status: "failed",
      errorCode: "i18n_setup_failed",
      errorMessage: message,
    };
  } finally {
    if (sandboxId) {
      try {
        await stopSetupSandbox(sandboxId);
      } catch {
        // Best-effort cleanup.
      }
    }
  }
}
