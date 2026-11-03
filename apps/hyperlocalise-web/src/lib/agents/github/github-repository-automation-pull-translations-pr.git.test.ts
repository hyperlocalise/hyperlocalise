/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// Runs the reuse-branch path against real git: a bare origin and a shallow clone as the sandbox.
const sandbox = vi.hoisted(() => ({
  dir: "",
  pullHead: "",
  // Keeps a developer's own git settings (signing, hooks) out of the test.
  env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
}));

vi.mock("@/lib/agents/github/app", () => ({
  getInstallationOctokit: async () => ({
    rest: {
      pulls: {
        list: async () => ({
          data: [
            {
              number: 5,
              html_url: "https://github.com/acme/web/pull/5",
              head: { sha: sandbox.pullHead },
            },
          ],
        }),
        update: async () => ({}),
        create: async () => ({
          data: { number: 6, html_url: "https://github.com/acme/web/pull/6" },
        }),
      },
      git: { getRef: async () => ({ data: { object: { sha: sandbox.pullHead } } }) },
    },
  }),
}));

vi.mock("@/lib/agents/github/github-repository-automation-sandbox", () => ({
  prepareGithubRepositoryAutomationSandboxForPush: async () => undefined,
  runGitDiffInSandbox: async () => "",
}));

vi.mock("@/lib/agents/github/github-repository-automation-check-run", () => ({
  buildGithubRepositoryAutomationJobDetailsUrl: () => undefined,
}));

vi.mock("@/lib/translation/sandbox", () => ({
  runSandboxCommand: async (_id: string, command: string, args: string[]) => {
    const result = spawnSync(command, args, {
      cwd: sandbox.dir,
      encoding: "utf8",
      env: sandbox.env,
    });
    return { exitCode: result.status ?? 1, output: `${result.stdout}${result.stderr}` };
  },
  writeFilesToSandbox: async (_id: string, files: { path: string; content: Buffer }[]) => {
    for (const file of files) {
      mkdirSync(dirname(join(sandbox.dir, file.path)), { recursive: true });
      writeFileSync(join(sandbox.dir, file.path), file.content);
    }
  },
}));

import { commitPushAndCreatePullTranslationsPullRequest } from "./github-repository-automation-pull-translations-pr";

const BRANCH = "hyperlocalise/translations-sync-1";
let root = "";

function git(cwd: string, ...args: string[]) {
  const result = spawnSync(
    "git",
    ["-c", "user.email=t@example.com", "-c", "user.name=t", ...args],
    {
      cwd,
      env: sandbox.env,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function write(cwd: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  }
}

/** Origin with a base commit and an open sync branch, then a shallow sandbox clone of the base. */
function setUp(input: { base: Record<string, string>; pullRequest: Record<string, string> }) {
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  git(root, "init", "-q", "--bare", origin);
  git(root, "init", "-q", "-b", "main", work);
  write(work, input.base);
  git(work, "add", "-A");
  git(work, "commit", "-qm", "base");
  git(work, "remote", "add", "origin", origin);
  git(work, "push", "-q", "origin", "main");
  git(work, "checkout", "-qb", BRANCH);
  write(work, input.pullRequest);
  git(work, "commit", "-qam", "sync");
  git(work, "push", "-q", "origin", BRANCH);
  sandbox.pullHead = git(work, "rev-parse", "HEAD");

  sandbox.dir = join(root, "sandbox");
  git(root, "clone", "-q", "--depth", "1", "--branch", "main", `file://${origin}`, sandbox.dir);
  git(sandbox.dir, "config", "user.email", "t@example.com");
  git(sandbox.dir, "config", "user.name", "t");
  return { origin, baseSha: git(sandbox.dir, "rev-parse", "HEAD") };
}

function run(baseSha: string, files: Record<string, string>) {
  return commitPushAndCreatePullTranslationsPullRequest({
    sandboxId: "sbx",
    installationId: "1",
    repositoryFullName: "acme/web",
    automationJobId: "run-1",
    organizationSlug: null,
    githubRepositoryId: "1",
    baseBranch: "main",
    baseSha,
    branchName: BRANCH,
    paths: Object.keys(files),
    candidates: Object.entries(files).map(([path, content]) => ({
      sourcePath: path,
      targetPath: path,
      locale: "",
      translationJobId: "run-1",
      outputFileId: "run-1",
      content: Buffer.from(content),
    })),
    linkedTranslationJobIds: [],
    reuseBranch: true,
  });
}

describe("reused sync branch against real git", () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "sync-branch-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("leaves the pull request alone when only some written files differ from the base", async () => {
    const files = {
      "locales/fr.json": "fr\n",
      "locales/de.json": "de\n",
      "locales/ü.json": "u2\n",
    };
    const { baseSha } = setUp({
      base: { "locales/fr.json": "old\n", "locales/de.json": "de\n", "locales/ü.json": "u\n" },
      pullRequest: { "locales/fr.json": "fr\n", "locales/ü.json": "u2\n" },
    });

    const result = await run(baseSha, files);

    expect(result.pushed).toBe(false);
  });

  it("pushes when a translation changed", async () => {
    const { origin, baseSha } = setUp({
      base: { "locales/fr.json": "old\n" },
      pullRequest: { "locales/fr.json": "fr\n" },
    });

    const result = await run(baseSha, { "locales/fr.json": "fr2\n" });

    expect(result.pushed).toBe(true);
    expect(git(origin, "show", `${BRANCH}:locales/fr.json`)).toBe("fr2");
  });

  it("pushes when the pull request still carries a file this run no longer changes", async () => {
    const { baseSha } = setUp({
      base: { "locales/fr.json": "old\n", "locales/de.json": "old\n" },
      pullRequest: { "locales/fr.json": "fr\n", "locales/de.json": "de\n" },
    });

    const result = await run(baseSha, { "locales/fr.json": "fr\n", "locales/de.json": "old\n" });

    expect(result.pushed).toBe(true);
  });
});
