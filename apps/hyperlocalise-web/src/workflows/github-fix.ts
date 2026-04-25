import { Sandbox } from "@vercel/sandbox";

import { getInstallationOctokit } from "@/lib/agents/github/app";
import type { GitHubFixRequestedEventData } from "@/lib/workflow/types";

const sandboxTimeoutMs = 10 * 60 * 1000;
const reportPath = ".hyperlocalise/fix-report.json";
const scopedReportPath = ".hyperlocalise/scoped-check-report.json";

type PullRequestMetadata = {
  baseBranch: string;
  headBranch: string;
  headSha: string;
  canPush: boolean;
};

type CheckFinding = {
  type?: string;
  sourceFile?: string;
  targetFile?: string;
  locale?: string;
  key?: string;
  annotationFile?: string;
  annotationLine?: number;
};

type ScopedFix = {
  sourceFile: string;
  key: string;
  locale: string;
};

type InstallationAuth = {
  token: string;
};

const fixableFindingTypes = new Set([
  "not_localized",
  "whitespace_only",
  "placeholder_mismatch",
  "html_tag_mismatch",
  "icu_shape_mismatch",
]);

async function getPullRequestMetadata(
  event: GitHubFixRequestedEventData,
): Promise<PullRequestMetadata> {
  "use step";

  const octokit = await getInstallationOctokit(event.installationId);
  const { data: pr } = await octokit.rest.pulls.get({
    owner: event.repositoryOwner,
    repo: event.repositoryName,
    pull_number: event.pullRequestNumber,
  });

  return {
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    headSha: pr.head.sha,
    canPush: pr.head.repo?.full_name === event.repositoryFullName,
  };
}

async function createFixSandbox(
  event: GitHubFixRequestedEventData,
  headBranch: string,
): Promise<{ sandboxId: string; token: string }> {
  "use step";

  const octokit = await getInstallationOctokit(event.installationId);
  const { token } = (await octokit.auth({ type: "installation" })) as InstallationAuth;
  const sandbox = await Sandbox.create({
    source: {
      depth: 1,
      password: token,
      revision: headBranch,
      type: "git",
      url: `https://github.com/${event.repositoryFullName}.git`,
      username: "x-access-token",
    },
    timeout: sandboxTimeoutMs,
  });

  return { sandboxId: sandbox.sandboxId, token };
}

async function stopFixSandbox(sandboxId: string): Promise<void> {
  "use step";

  const sandbox = await Sandbox.get({ sandboxId });
  await sandbox.stop();
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

async function prepareSandbox(
  sandboxId: string,
  event: GitHubFixRequestedEventData,
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
    ["bash", ["-lc", "mkdir -p .hyperlocalise"]],
  ] satisfies Array<[string, string[]]>) {
    const result = await runSandboxCommand(sandboxId, command, args);
    if (result.exitCode !== 0) {
      throw new Error(`sandbox setup failed: ${result.output}`);
    }
  }

  const installResult = await runSandboxCommand(sandboxId, "bash", [
    "-lc",
    'command -v hl >/dev/null 2>&1 || command -v hyperlocalise >/dev/null 2>&1 || (curl -fsSL https://hyperlocalise.com/install | bash); command -v hl >/dev/null 2>&1 || { mkdir -p ~/.local/bin; ln -sf "$(command -v hyperlocalise)" ~/.local/bin/hl; }',
  ]);
  if (installResult.exitCode !== 0) {
    throw new Error(`hyperlocalise CLI installation failed: ${installResult.output}`);
  }
}

function matchesCommentLine(finding: CheckFinding, path: string, line: number): boolean {
  return finding.annotationFile === path && finding.annotationLine === line;
}

function uniqueScopedFix(findings: CheckFinding[], locale: string | null): ScopedFix | null {
  const unique = new Map<string, ScopedFix>();
  for (const finding of findings) {
    if (!finding.type || !fixableFindingTypes.has(finding.type)) {
      continue;
    }
    if (!finding.sourceFile || !finding.key || !finding.locale) {
      continue;
    }
    if (locale && finding.locale !== locale) {
      continue;
    }
    unique.set(`${finding.sourceFile}\0${finding.key}\0${finding.locale}`, {
      sourceFile: finding.sourceFile,
      key: finding.key,
      locale: finding.locale,
    });
  }
  if (unique.size !== 1) {
    return null;
  }
  return [...unique.values()][0] ?? null;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function resolveScopedFix(
  sandboxId: string,
  event: GitHubFixRequestedEventData,
): Promise<ScopedFix | null> {
  if (event.scope.type !== "review_comment") {
    return null;
  }
  const line = event.scope.line ?? event.scope.originalLine;
  if (!line) {
    return null;
  }

  const check = await runSandboxCommand(sandboxId, "bash", [
    "-lc",
    `export PATH="$HOME/.local/bin:$PATH"; hl check --no-fail --format json --json-report ${scopedReportPath} >/dev/null`,
  ]);
  if (check.exitCode !== 0) {
    throw new Error(`scoped check failed: ${check.output}`);
  }

  const report = await runSandboxCommand(sandboxId, "cat", [scopedReportPath]);
  if (report.exitCode !== 0) {
    throw new Error(`read scoped report failed: ${report.output}`);
  }

  let parsed: { findings?: CheckFinding[] };
  try {
    parsed = JSON.parse(report.output) as { findings?: CheckFinding[] };
  } catch {
    throw new Error(`failed to parse scoped check report: ${report.output}`);
  }
  const matches = (parsed.findings ?? []).filter((finding) =>
    matchesCommentLine(
      finding,
      event.scope.type === "review_comment" ? event.scope.path : "",
      line,
    ),
  );

  return uniqueScopedFix(matches, event.scope.locale);
}

async function runFixCommand(
  sandboxId: string,
  event: GitHubFixRequestedEventData,
): Promise<
  { exitCode: number; output: string; command: string[] } | { skipped: true; reason: string }
> {
  "use step";

  const args = ["fix", "--no-fail", "--json-report", reportPath];
  if (event.scope.type === "review_comment") {
    const scoped = await resolveScopedFix(sandboxId, event);
    if (!scoped) {
      return {
        skipped: true,
        reason:
          "I could not map this inline comment to exactly one fixable translation entry. Comment `@hyperlocalise fix` on the PR conversation to run a broad fix.",
      };
    }
    args.push("--file", scoped.sourceFile, "--key", scoped.key, "--locale", scoped.locale);
  }

  const result = await runSandboxCommand(sandboxId, "bash", [
    "-lc",
    `export PATH="$HOME/.local/bin:$PATH"; hl ${args.map(shellQuote).join(" ")}`,
  ]);
  return {
    ...result,
    command: ["hl", ...args],
  };
}

async function hasUncommittedChanges(sandboxId: string): Promise<boolean> {
  "use step";

  const result = await runSandboxCommand(sandboxId, "git", ["status", "--porcelain"]);
  if (result.exitCode !== 0) {
    throw new Error(`git status failed: ${result.output}`);
  }
  return result.output.trim().length > 0;
}

async function commitAndPush(sandboxId: string, headBranch: string): Promise<void> {
  "use step";

  for (const [command, args] of [
    ["git", ["add", "-u"]],
    ["git", ["commit", "-m", "fix(i18n): apply hyperlocalise fixes"]],
    ["git", ["push", "origin", headBranch]],
  ] satisfies Array<[string, string[]]>) {
    const result = await runSandboxCommand(sandboxId, command, args);
    if (result.exitCode !== 0) {
      throw new Error(`git command failed: ${result.output}`);
    }
  }
}

async function postPullRequestComment(
  event: GitHubFixRequestedEventData,
  body: string,
): Promise<void> {
  "use step";

  const octokit = await getInstallationOctokit(event.installationId);
  await octokit.rest.issues.createComment({
    owner: event.repositoryOwner,
    repo: event.repositoryName,
    issue_number: event.pullRequestNumber,
    body,
  });
}

function formatFixSummary(input: {
  changed: boolean;
  command: string[];
  exitCode: number;
  output: string;
}): string {
  const status = input.changed ? "pushed fixes to this PR" : "completed without file changes";
  const output = input.output.trim();
  return [
    `## Hyperlocalise fix ${status}`,
    "",
    `Command: \`${input.command.join(" ")}\``,
    `Exit code: \`${input.exitCode}\``,
    output ? `\n\`\`\`\n${output.slice(0, 3000)}\n\`\`\`` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function githubFixWorkflow(event: GitHubFixRequestedEventData) {
  "use workflow";

  const pr = await getPullRequestMetadata(event);
  if (!pr.canPush) {
    await postPullRequestComment(
      event,
      "## Hyperlocalise fix skipped\n\nI do not have permission to push to this PR branch.",
    );
    return;
  }

  const { sandboxId, token } = await createFixSandbox(event, pr.headBranch);
  try {
    await prepareSandbox(sandboxId, event, token);
    const fix = await runFixCommand(sandboxId, event);
    if ("skipped" in fix) {
      await postPullRequestComment(event, `## Hyperlocalise fix skipped\n\n${fix.reason}`);
      return;
    }
    if (fix.exitCode !== 0) {
      await postPullRequestComment(
        event,
        formatFixSummary({
          changed: false,
          command: fix.command,
          exitCode: fix.exitCode,
          output: fix.output,
        }),
      );
      return;
    }

    const changed = await hasUncommittedChanges(sandboxId);
    if (changed) {
      await commitAndPush(sandboxId, pr.headBranch);
    }
    await postPullRequestComment(
      event,
      formatFixSummary({
        changed,
        command: fix.command,
        exitCode: fix.exitCode,
        output: fix.output,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await postPullRequestComment(event, `## Hyperlocalise fix failed\n\n${message}`);
    throw error;
  } finally {
    await stopFixSandbox(sandboxId);
  }
}
