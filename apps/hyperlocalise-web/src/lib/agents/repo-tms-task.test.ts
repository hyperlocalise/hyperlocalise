import { describe, expect, it } from "vite-plus/test";

import {
  buildRepoTmsTaskIdempotencyKey,
  deserializeRepoTmsAgentTask,
  isResolvedGitHubContext,
  isUnresolvedGitHubContext,
  repoTmsAgentTaskSchema,
  serializeRepoTmsAgentTask,
} from "./repo-tms-task";

describe("repoTmsAgentTaskSchema", () => {
  it("accepts a minimal valid task", () => {
    const task = {
      id: "task_001",
      source: "slack" as const,
      sourceThreadId: "thread_123",
      actor: {
        sourceUserId: "U123",
      },
      organizationId: "org_abc",
      projectId: null,
      workMode: "read_only" as const,
      instructions: "Check translation coverage for the mobile app",
      createdAt: "2026-05-20T10:00:00.000Z",
      idempotencyKey: "key_001",
    };

    expect(() => repoTmsAgentTaskSchema.parse(task)).not.toThrow();
  });

  it("accepts a task with resolved GitHub context", () => {
    const task = {
      id: "task_002",
      source: "github" as const,
      sourceThreadId: "thread_456",
      actor: {
        sourceUserId: "octocat",
        userId: "user_001",
        email: "octocat@example.com",
        displayName: "The Octocat",
      },
      organizationId: "org_def",
      projectId: "proj_123",
      workMode: "write" as const,
      instructions: "Fix i18n issues in the login flow",
      githubContext: {
        resolved: true,
        installationId: 54321,
        repositoryFullName: "hyperlocalise/app",
        pullRequestNumber: 42,
        commitSha: "abc123def456",
        branch: "main",
        commentId: 987,
      },
      createdAt: "2026-05-20T11:00:00.000Z",
      idempotencyKey: "key_002",
    };

    const parsed = repoTmsAgentTaskSchema.parse(task);
    expect(parsed.githubContext).toEqual(task.githubContext);
  });

  it("accepts a task with unresolved GitHub context", () => {
    const task = {
      id: "task_003",
      source: "github" as const,
      sourceThreadId: "thread_789",
      actor: {
        sourceUserId: "octocat",
      },
      organizationId: "org_def",
      projectId: null,
      workMode: "approval_required" as const,
      instructions: "Update translations",
      githubContext: {
        resolved: false as const,
        reason: "Could not determine the target pull request from the comment.",
        hint: "Please mention the PR number or comment on a PR thread.",
      },
      createdAt: "2026-05-20T12:00:00.000Z",
      idempotencyKey: "key_003",
    };

    const parsed = repoTmsAgentTaskSchema.parse(task);
    expect(parsed.githubContext).toEqual(task.githubContext);
  });

  it("rejects a task with an invalid work mode", () => {
    const task = {
      id: "task_004",
      source: "slack" as const,
      sourceThreadId: "thread_000",
      actor: { sourceUserId: "U000" },
      organizationId: "org_zzz",
      projectId: null,
      workMode: "full_access",
      instructions: "Do everything",
      createdAt: "2026-05-20T13:00:00.000Z",
      idempotencyKey: "key_004",
    };

    expect(() => repoTmsAgentTaskSchema.parse(task)).toThrow();
  });

  it("rejects a task with an invalid source", () => {
    const task = {
      id: "task_005",
      source: "discord",
      sourceThreadId: "thread_000",
      actor: { sourceUserId: "U000" },
      organizationId: "org_zzz",
      projectId: null,
      workMode: "read_only",
      instructions: "Check status",
      createdAt: "2026-05-20T13:00:00.000Z",
      idempotencyKey: "key_005",
    };

    expect(() => repoTmsAgentTaskSchema.parse(task)).toThrow();
  });

  it("rejects a task with a missing required actor field", () => {
    const task = {
      id: "task_006",
      source: "slack" as const,
      sourceThreadId: "thread_000",
      actor: {},
      organizationId: "org_zzz",
      projectId: null,
      workMode: "read_only",
      instructions: "Check status",
      createdAt: "2026-05-20T13:00:00.000Z",
      idempotencyKey: "key_006",
    };

    expect(() => repoTmsAgentTaskSchema.parse(task)).toThrow();
  });

  it("rejects a task with an invalid datetime string", () => {
    const task = {
      id: "task_007",
      source: "slack" as const,
      sourceThreadId: "thread_000",
      actor: { sourceUserId: "U000" },
      organizationId: "org_zzz",
      projectId: null,
      workMode: "read_only",
      instructions: "Check status",
      createdAt: "not-a-date",
      idempotencyKey: "key_007",
    };

    expect(() => repoTmsAgentTaskSchema.parse(task)).toThrow();
  });
});

describe("buildRepoTmsTaskIdempotencyKey", () => {
  it("produces the same key for identical inputs", () => {
    const input = {
      source: "slack" as const,
      sourceThreadId: "thread_123",
      organizationId: "org_abc",
      instructions: "Check translation coverage",
    };

    const first = buildRepoTmsTaskIdempotencyKey(input);
    const second = buildRepoTmsTaskIdempotencyKey(input);

    expect(first).toBe(second);
  });

  it("produces different keys for different sources", () => {
    const base = {
      sourceThreadId: "thread_123",
      organizationId: "org_abc",
      instructions: "Check translation coverage",
    };

    const slackKey = buildRepoTmsTaskIdempotencyKey({ ...base, source: "slack" });
    const githubKey = buildRepoTmsTaskIdempotencyKey({ ...base, source: "github" });

    expect(slackKey).not.toBe(githubKey);
  });

  it("produces different keys for different instructions", () => {
    const base = {
      source: "slack" as const,
      sourceThreadId: "thread_123",
      organizationId: "org_abc",
    };

    const first = buildRepoTmsTaskIdempotencyKey({
      ...base,
      instructions: "Check translation coverage",
    });
    const second = buildRepoTmsTaskIdempotencyKey({
      ...base,
      instructions: "Fix translation coverage",
    });

    expect(first).not.toBe(second);
  });

  it("includes GitHub context dimensions when provided", () => {
    const base = {
      source: "github" as const,
      sourceThreadId: "thread_456",
      organizationId: "org_def",
      instructions: "Fix i18n",
    };

    const withoutGitHub = buildRepoTmsTaskIdempotencyKey(base);
    const withGitHub = buildRepoTmsTaskIdempotencyKey({
      ...base,
      githubContext: {
        resolved: true,
        installationId: 54321,
        repositoryFullName: "hyperlocalise/app",
        pullRequestNumber: 42,
        commitSha: "abc123",
      },
    });

    expect(withGitHub).not.toBe(withoutGitHub);
    expect(withGitHub).toMatch(/^[a-f0-9]{64}$/);
    expect(withoutGitHub).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different keys for different PR numbers", () => {
    const base = {
      source: "github" as const,
      sourceThreadId: "thread_456",
      organizationId: "org_def",
      instructions: "Fix i18n",
      githubContext: {
        resolved: true as const,
        installationId: 54321,
        repositoryFullName: "hyperlocalise/app",
        pullRequestNumber: 42,
      },
    };

    const first = buildRepoTmsTaskIdempotencyKey(base);
    const second = buildRepoTmsTaskIdempotencyKey({
      ...base,
      githubContext: {
        ...base.githubContext,
        pullRequestNumber: 43,
      },
    });

    expect(first).not.toBe(second);
  });

  it("produces different keys for different commit SHAs", () => {
    const base = {
      source: "github" as const,
      sourceThreadId: "thread_456",
      organizationId: "org_def",
      instructions: "Fix i18n",
      githubContext: {
        resolved: true as const,
        installationId: 54321,
        repositoryFullName: "hyperlocalise/app",
        commitSha: "abc123",
      },
    };

    const first = buildRepoTmsTaskIdempotencyKey(base);
    const second = buildRepoTmsTaskIdempotencyKey({
      ...base,
      githubContext: {
        ...base.githubContext,
        commitSha: "def456",
      },
    });

    expect(first).not.toBe(second);
  });

  it("handles missing optional GitHub context fields gracefully", () => {
    const key = buildRepoTmsTaskIdempotencyKey({
      source: "github",
      sourceThreadId: "thread_456",
      organizationId: "org_def",
      instructions: "Fix i18n",
      githubContext: {
        resolved: true,
        installationId: 54321,
        repositoryFullName: "hyperlocalise/app",
      },
    });

    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).toBe(
      buildRepoTmsTaskIdempotencyKey({
        source: "github",
        sourceThreadId: "thread_456",
        organizationId: "org_def",
        instructions: "Fix i18n",
        githubContext: {
          resolved: true,
          installationId: 54321,
          repositoryFullName: "hyperlocalise/app",
        },
      }),
    );
  });
});

describe("serializeRepoTmsAgentTask", () => {
  it("round-trips a task through JSON", () => {
    const task = repoTmsAgentTaskSchema.parse({
      id: "task_roundtrip",
      source: "github",
      sourceThreadId: "thread_rt",
      actor: {
        sourceUserId: "octocat",
        userId: "user_rt",
        email: "rt@example.com",
        displayName: "RT",
      },
      organizationId: "org_rt",
      projectId: "proj_rt",
      workMode: "write",
      instructions: "Round-trip test",
      githubContext: {
        resolved: true,
        installationId: 1,
        repositoryFullName: "owner/repo",
        pullRequestNumber: 1,
        commitSha: "sha1",
        branch: "main",
        commentId: 1,
      },
      createdAt: "2026-05-20T14:00:00.000Z",
      idempotencyKey: "key_rt",
    });

    const json = serializeRepoTmsAgentTask(task);
    const recovered = deserializeRepoTmsAgentTask(json);

    expect(recovered).toEqual(task);
  });

  it("round-trips a task with unresolved GitHub context", () => {
    const task = repoTmsAgentTaskSchema.parse({
      id: "task_unresolved",
      source: "github",
      sourceThreadId: "thread_unres",
      actor: { sourceUserId: "octocat" },
      organizationId: "org_unres",
      projectId: null,
      workMode: "approval_required",
      instructions: "Unresolved test",
      githubContext: {
        resolved: false,
        reason: "Missing PR context",
        hint: "Provide a PR number",
      },
      createdAt: "2026-05-20T15:00:00.000Z",
      idempotencyKey: "key_unres",
    });

    const json = serializeRepoTmsAgentTask(task);
    const recovered = deserializeRepoTmsAgentTask(json);

    expect(recovered).toEqual(task);
  });

  it("throws on invalid JSON during deserialization", () => {
    expect(() => deserializeRepoTmsAgentTask("not-json")).toThrow();
  });

  it("throws on schema violations during deserialization", () => {
    const bad = JSON.stringify({ unexpected: "shape" });
    expect(() => deserializeRepoTmsAgentTask(bad)).toThrow();
  });
});

describe("isUnresolvedGitHubContext", () => {
  it("returns true for unresolved context", () => {
    const context = {
      resolved: false as const,
      reason: "Missing PR",
    };

    expect(isUnresolvedGitHubContext(context)).toBe(true);
    expect(isResolvedGitHubContext(context)).toBe(false);
  });

  it("returns false for resolved context", () => {
    const context = {
      resolved: true as const,
      installationId: 1,
      repositoryFullName: "owner/repo",
    };

    expect(isUnresolvedGitHubContext(context)).toBe(false);
    expect(isResolvedGitHubContext(context)).toBe(true);
  });

  it("returns false for undefined context", () => {
    expect(isUnresolvedGitHubContext(undefined)).toBe(false);
    expect(isResolvedGitHubContext(undefined)).toBe(false);
  });
});
