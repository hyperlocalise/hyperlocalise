import { Sandbox } from "@vercel/sandbox";
import { ToolLoopAgent, type ModelMessage, type ToolSet } from "ai";
import { getWorkflowMetadata } from "workflow";

import {
  buildI18nSetupSuggestion,
  type I18nSetupMode,
} from "@/lib/agents/i18n-setup/merge-i18n-config";
import {
  detectLocaleFiles,
  isIgnoredLocaleScanPath,
} from "@/lib/agents/i18n-setup/locale-detection";
import {
  buildDetectionFromTmsHints,
  collectTmsHints,
  formatTmsHintsSummary,
  mergeTmsHintsIntoDetection,
  TMS_CONFIG_CANDIDATE_PATHS,
} from "@/lib/agents/i18n-setup/tms-config-hints";
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

type ExistingConfigState =
  | { kind: "none" }
  | { kind: "jsonc"; content: string }
  | { kind: "yml"; content: string };

async function getInstallationOctokitForStep(installationId: number) {
  const { getInstallationOctokit } = await import("@/lib/agents/github/app");
  return getInstallationOctokit(installationId);
}

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
): Promise<{ sandboxId: string }> {
  "use step";

  const octokit = await getInstallationOctokitForStep(event.installationId);
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

  return { sandboxId: sandbox.name };
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
  options?: { env?: Record<string, string> },
): Promise<{ exitCode: number; output: string }> {
  const sandbox = await Sandbox.get({ name: sandboxId });
  const result = await sandbox.runCommand({
    cmd: command,
    args,
    env: options?.env,
  });
  return {
    exitCode: result.exitCode,
    output: await result.output("both"),
  };
}

async function prepareSandbox(
  sandboxId: string,
  event: I18nSetupRequestedEventData,
): Promise<void> {
  "use step";

  const octokit = await getInstallationOctokitForStep(event.installationId);
  const { token } = (await octokit.auth({ type: "installation" })) as InstallationAuth;
  const remote = `https://github.com/${event.repositoryFullName}.git`;

  for (const [command, args, options] of [
    ["git", ["config", "user.name", "hyperlocalise[bot]"]],
    ["git", ["config", "user.email", "hyperlocalise[bot]@users.noreply.github.com"]],
    ["git", ["config", "credential.helper", "store"]],
    [
      "bash",
      [
        "-lc",
        `printf '%s\\n' "https://x-access-token:$GITHUB_TOKEN@github.com" > ~/.git-credentials`,
      ],
      { env: { GITHUB_TOKEN: token } },
    ],
    ["git", ["remote", "set-url", "origin", remote]],
  ] satisfies Array<[string, string[], { env?: Record<string, string> }?]>) {
    const result = await runSandboxCommand(sandboxId, command, args, options);
    if (result.exitCode !== 0) {
      throw new Error(`sandbox setup failed: ${result.output}`);
    }
  }
}

async function resolveExistingConfig(sandboxId: string): Promise<ExistingConfigState> {
  "use step";

  const ymlResult = await runSandboxCommand(sandboxId, "test", ["-f", "i18n.yml"]);
  if (ymlResult.exitCode === 0) {
    const readResult = await runSandboxCommand(sandboxId, "cat", ["i18n.yml"]);
    if (readResult.exitCode !== 0) {
      throw new Error(`failed to read i18n.yml: ${readResult.output}`);
    }

    return { kind: "yml", content: readResult.output };
  }

  const jsoncResult = await runSandboxCommand(sandboxId, "test", ["-f", "i18n.jsonc"]);
  if (jsoncResult.exitCode === 0) {
    const readResult = await runSandboxCommand(sandboxId, "cat", ["i18n.jsonc"]);
    if (readResult.exitCode !== 0) {
      throw new Error(`failed to read i18n.jsonc: ${readResult.output}`);
    }

    return { kind: "jsonc", content: readResult.output };
  }

  return { kind: "none" };
}

function formatSamplePaths(paths: string[], limit = 12): string {
  const sample = paths.slice(0, limit);
  const lines = sample.map((path) => `- ${path}`);
  if (paths.length > limit) {
    lines.push(`- ... and ${paths.length - limit} more`);
  }
  return lines.join("\n");
}

function buildI18nSetupAgentInstructions(input: {
  mode: I18nSetupMode;
  detectedLocaleCount: number;
  suggestedConfig: string;
  samplePaths: string[];
  tmsHintsSummary?: string | null;
}): string {
  const goalByMode: Record<I18nSetupMode, string> = {
    create: "create i18n.yml for this repository based on discovered locale files",
    update: "update the existing i18n.yml with newly discovered locale files",
    convert:
      "migrate i18n.jsonc to i18n.yml and merge any newly discovered locale files into the config",
  };

  const configStepByMode: Record<I18nSetupMode, string> = {
    create: "1. Use detectRepoConfig to confirm i18n.yml does not already exist.",
    update: "1. Use detectRepoConfig and read i18n.yml to review the existing config.",
    convert:
      "1. Use detectRepoConfig and read i18n.jsonc to review the existing config before migration.",
  };

  return [
    "You are running the Hyperlocalise i18n setup wizard.",
    `Goal: ${goalByMode[input.mode]}.`,
    `Detected ${input.detectedLocaleCount} candidate locale file(s) across supported formats (JSON, YAML, PO, XLIFF, ARB, .strings, .xcstrings, and more).`,
    "Available repository tools: read, grep, glob, bash, detectRepoConfig, repoGitState, runHyperlocaliseCli.",
    "Use read/grep/glob to inspect locale file paths and confirm bucket patterns before writing the config.",
    input.tmsHintsSummary
      ? "When TMS config hints disagree with scanned locale files, prefer the TMS file mappings for bucket patterns and locale lists."
      : null,
    "Steps:",
    configStepByMode[input.mode],
    "2. Use glob or grep to validate locale file naming patterns when the suggested config looks uncertain.",
    "3. Use read to inspect representative locale files when needed.",
    "4. Call writeI18nConfig exactly once with the final YAML content.",
    input.mode === "convert"
      ? "5. Do not keep i18n.jsonc. The workflow removes it after i18n.yml is written."
      : null,
    "Do not commit, push, or create pull requests yourself.",
    "Sample discovered locale files:",
    formatSamplePaths(input.samplePaths),
    input.tmsHintsSummary
      ? ["Existing TMS configuration hints:", input.tmsHintsSummary].join("\n")
      : null,
    "Suggested starter config based on deterministic detection:",
    input.suggestedConfig,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function scanTmsConfigFiles(
  sandboxId: string,
): Promise<Array<{ path: string; content: string }>> {
  "use step";

  const found: Array<{ path: string; content: string }> = [];

  for (const path of TMS_CONFIG_CANDIDATE_PATHS) {
    const existsResult = await runSandboxCommand(sandboxId, "test", ["-f", path]);
    if (existsResult.exitCode !== 0) {
      continue;
    }

    const readResult = await runSandboxCommand(sandboxId, "cat", [path]);
    if (readResult.exitCode !== 0) {
      throw new Error(`failed to read ${path}: ${readResult.output}`);
    }

    found.push({ path, content: readResult.output });
  }

  return found;
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
  mode: I18nSetupMode;
  samplePaths: string[];
  tmsHintsSummary?: string | null;
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
      allowUpdate: input.mode === "update" || input.mode === "convert",
      allowJsoncConversion: input.mode === "convert",
    }),
  };

  const agent = new ToolLoopAgent({
    model: getHyperlocaliseAgentModel(),
    tools,
    stopWhen: [(step) => step.steps.length >= agentStepLimit],
    instructions: buildHyperlocaliseAgentInstructions({
      surface: "web",
      projectId: null,
      additionalInstructions: buildI18nSetupAgentInstructions({
        mode: input.mode,
        detectedLocaleCount: input.detectedLocaleCount,
        suggestedConfig: input.suggestedConfig,
        samplePaths: input.samplePaths,
        tmsHintsSummary: input.tmsHintsSummary,
      }),
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
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `hyperlocalise/i18n-setup-${ts}-${rand}`;
}

async function commitPushAndCreatePullRequest(input: {
  event: I18nSetupRequestedEventData;
  sandboxId: string;
  branchName: string;
  summary: string;
  mode: I18nSetupMode;
  removeJsonc: boolean;
}): Promise<{ pullRequestUrl: string; pullRequestNumber: number }> {
  "use step";

  const pushCheck = await canPushToGitHubRepository({
    installationId: input.event.installationId,
    repositoryFullName: input.event.repositoryFullName,
  });

  if (!pushCheck.canPush) {
    throw new Error(pushCheck.reason ?? "Cannot push to repository.");
  }

  const commitMessageByMode: Record<I18nSetupMode, string> = {
    create: "chore(i18n): add Hyperlocalise i18n.yml",
    update: "chore(i18n): update Hyperlocalise i18n.yml",
    convert: "chore(i18n): migrate i18n.jsonc to i18n.yml",
  };
  const commitMessage = commitMessageByMode[input.mode];
  const pullRequestTitle = commitMessage;

  const checkoutResult = await runSandboxCommand(input.sandboxId, "git", [
    "checkout",
    "-b",
    input.branchName,
  ]);
  if (checkoutResult.exitCode !== 0) {
    throw new Error(`git command failed: ${checkoutResult.output}`);
  }

  if (input.removeJsonc) {
    const removeJsoncResult = await runSandboxCommand(input.sandboxId, "git", [
      "rm",
      "-f",
      "i18n.jsonc",
    ]);
    if (removeJsoncResult.exitCode !== 0) {
      throw new Error(`git command failed: ${removeJsoncResult.output}`);
    }
  }

  for (const [command, args] of [
    ["git", ["add", "i18n.yml"]],
    ["git", ["commit", "-m", commitMessage]],
    ["git", ["push", "-u", "origin", input.branchName]],
  ] satisfies Array<[string, string[]]>) {
    const result = await runSandboxCommand(input.sandboxId, command, args);
    if (result.exitCode !== 0) {
      throw new Error(`git command failed: ${result.output}`);
    }
  }

  const octokit = await getInstallationOctokitForStep(input.event.installationId);
  const prBodyIntroByMode: Record<I18nSetupMode, string> = {
    create:
      "This pull request adds an `i18n.yml` generated by the Hyperlocalise i18n setup wizard.",
    update: "This pull request updates `i18n.yml` with newly discovered locale files.",
    convert:
      "This pull request migrates `i18n.jsonc` to `i18n.yml` and removes the legacy JSONC config.",
  };
  const { data: pullRequest } = await octokit.rest.pulls.create({
    owner: input.event.repositoryOwner,
    repo: input.event.repositoryName,
    title: pullRequestTitle,
    head: input.branchName,
    base: input.event.baseBranch,
    body: [
      "## Hyperlocalise i18n setup",
      "",
      prBodyIntroByMode[input.mode],
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

    const { sandboxId: createdSandboxId } = await createSetupSandbox(event);
    sandboxId = createdSandboxId;

    await prepareSandbox(sandboxId, event);

    const existingConfig = await resolveExistingConfig(sandboxId);

    const [scannedPaths, tmsConfigFiles] = await Promise.all([
      scanLocaleFilePaths(sandboxId),
      scanTmsConfigFiles(sandboxId),
    ]);
    const tmsHints = collectTmsHints(tmsConfigFiles, existingConfig);

    let detection = detectLocaleFiles(scannedPaths);
    if (!detection && tmsHints.length > 0) {
      detection = buildDetectionFromTmsHints(tmsHints);
    }

    if (detection && tmsHints.length > 0) {
      detection = mergeTmsHintsIntoDetection(detection, tmsHints);
    }

    if (!detection) {
      const message =
        "Could not find locale translation files in this repository. Look for paths like locales/en-US.json, locales/fr.po, messages/de.yaml, or an existing crowdin.yml / .phrase.yml config.";
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

    const suggestionResult = buildI18nSetupSuggestion(detection, existingConfig);
    if ("error" in suggestionResult) {
      const message = "Could not parse i18n.jsonc. Fix the config syntax and try again.";
      await updateRunStatusStep(event.runId, {
        status: "failed",
        errorCode: suggestionResult.error,
        errorMessage: message,
        workflowRunId,
      });
      return {
        ok: false,
        runId: event.runId,
        status: "failed",
        errorCode: suggestionResult.error,
        errorMessage: message,
      };
    }

    const suggestion = suggestionResult;

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

    const tmsHintsSummary = formatTmsHintsSummary(tmsHints);

    const agentResult = await runSetupAgentStep({
      event,
      sandboxId,
      suggestedConfig: suggestion.yaml,
      detectedLocaleCount: detection.allFiles.length,
      mode: suggestion.mode,
      samplePaths: scannedPaths,
      tmsHintsSummary,
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
      removeJsonc: suggestion.removeJsonc,
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
