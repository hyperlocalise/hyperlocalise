import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@/lib/agents/github/app", () => ({
  getInstallationOctokit: vi.fn(),
}));

import { getInstallationOctokit } from "@/lib/agents/github/app";
import {
  canPushToGitHubBranch,
  checkRepoTmsWriteGate,
  type WriteGateResult,
} from "./repo-tms-write-gate";

function deniedReason(result: WriteGateResult): string {
  if (!result.allowed) {
    return result.reason;
  }
  return "";
}

describe("checkRepoTmsWriteGate", () => {
  it("denies all writes in read_only mode regardless of source or role", () => {
    const result = checkRepoTmsWriteGate({
      workMode: "read_only",
      source: "slack",
      actor: { sourceUserId: "U1", role: "owner" },
      action: "apply_fixes",
    });

    expect(result.allowed).toBe(false);
    expect(deniedReason(result)).toContain("read-only");
  });

  it("allows Slack write for admin role in write mode", () => {
    const result = checkRepoTmsWriteGate({
      workMode: "write",
      source: "slack",
      actor: { sourceUserId: "U1", role: "admin" },
      action: "commit_changes",
    });

    expect(result.allowed).toBe(true);
  });

  it("allows Slack write for owner role in write mode", () => {
    const result = checkRepoTmsWriteGate({
      workMode: "write",
      source: "slack",
      actor: { sourceUserId: "U1", role: "owner" },
      action: "push_to_branch",
    });

    expect(result.allowed).toBe(true);
  });

  it("denies Slack write for member role in write mode", () => {
    const result = checkRepoTmsWriteGate({
      workMode: "write",
      source: "slack",
      actor: { sourceUserId: "U1", role: "member" },
      action: "apply_fixes",
    });

    expect(result.allowed).toBe(false);
    expect(deniedReason(result)).toContain("admin or owner");
  });

  it("denies Slack write when role is missing in write mode", () => {
    const result = checkRepoTmsWriteGate({
      workMode: "write",
      source: "slack",
      actor: { sourceUserId: "U1" },
      action: "apply_fixes",
    });

    expect(result.allowed).toBe(false);
    expect(deniedReason(result)).toContain("admin or owner");
  });

  it("allows Slack approval_required for admin role (auto-approve)", () => {
    const result = checkRepoTmsWriteGate({
      workMode: "approval_required",
      source: "slack",
      actor: { sourceUserId: "U1", role: "admin" },
      action: "upload_sources",
    });

    expect(result.allowed).toBe(true);
  });

  it("denies Slack approval_required for member role without implying an approval path", () => {
    const result = checkRepoTmsWriteGate({
      workMode: "approval_required",
      source: "slack",
      actor: { sourceUserId: "U1", role: "member" },
      action: "upload_sources",
    });

    expect(result.allowed).toBe(false);
    expect(deniedReason(result)).toContain("admin or owner privileges");
  });

  it("allows GitHub write mode for any role", () => {
    const result = checkRepoTmsWriteGate({
      workMode: "write",
      source: "github",
      actor: { sourceUserId: "octocat" },
      action: "push_to_branch",
    });

    expect(result.allowed).toBe(true);
  });

  it("denies GitHub approval_required for member role without implying an approval path", () => {
    const result = checkRepoTmsWriteGate({
      workMode: "approval_required",
      source: "github",
      actor: { sourceUserId: "octocat", role: "member" },
      action: "commit_changes",
    });

    expect(result.allowed).toBe(false);
    expect(deniedReason(result)).toContain("admin or owner privileges");
  });

  it("allows GitHub approval_required for admin role (auto-approve)", () => {
    const result = checkRepoTmsWriteGate({
      workMode: "approval_required",
      source: "github",
      actor: { sourceUserId: "octocat", role: "admin" },
      action: "commit_changes",
    });

    expect(result.allowed).toBe(true);
  });

  it("treats chat_ui like Slack for permission checks", () => {
    const result = checkRepoTmsWriteGate({
      workMode: "write",
      source: "chat_ui",
      actor: { sourceUserId: "user_1", role: "member" },
      action: "apply_fixes",
    });

    expect(result.allowed).toBe(false);
    expect(deniedReason(result)).toContain("admin or owner");
  });
});

describe("canPushToGitHubBranch", () => {
  it("returns canPush=true when the installation has push access", async () => {
    const getBranchMock = vi.fn(async () => ({
      data: { protected: false },
    }));
    vi.mocked(getInstallationOctokit).mockResolvedValue({
      rest: {
        repos: {
          get: vi.fn(async () => ({
            data: { permissions: { push: true } },
          })),
          getBranch: getBranchMock,
        },
      },
    } as unknown as Awaited<ReturnType<typeof getInstallationOctokit>>);

    const result = await canPushToGitHubBranch({
      installationId: 123,
      repositoryFullName: "owner/repo",
      branch: "main",
    });

    expect(result.canPush).toBe(true);
    expect(getBranchMock).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      branch: "main",
    });
  });

  it("returns canPush=false when the installation lacks push access", async () => {
    vi.mocked(getInstallationOctokit).mockResolvedValue({
      rest: {
        repos: {
          get: vi.fn(async () => ({
            data: { permissions: { push: false } },
          })),
        },
      },
    } as unknown as Awaited<ReturnType<typeof getInstallationOctokit>>);

    const result = await canPushToGitHubBranch({
      installationId: 123,
      repositoryFullName: "owner/repo",
      branch: "main",
    });

    expect(result.canPush).toBe(false);
    expect(result.reason).toContain("does not have push access");
  });

  it("returns canPush=false when the target branch is protected", async () => {
    vi.mocked(getInstallationOctokit).mockResolvedValue({
      rest: {
        repos: {
          get: vi.fn(async () => ({
            data: { permissions: { push: true } },
          })),
          getBranch: vi.fn(async () => ({
            data: { protected: true },
          })),
        },
      },
    } as unknown as Awaited<ReturnType<typeof getInstallationOctokit>>);

    const result = await canPushToGitHubBranch({
      installationId: 123,
      repositoryFullName: "owner/repo",
      branch: "release/2026-05",
    });

    expect(result.canPush).toBe(false);
    expect(result.reason).toContain("release/2026-05 is protected");
  });

  it("returns canPush=false for invalid repository full name", async () => {
    const result = await canPushToGitHubBranch({
      installationId: 123,
      repositoryFullName: "invalid",
      branch: "main",
    });

    expect(result.canPush).toBe(false);
    expect(result.reason).toContain("Invalid repository");
  });

  it("returns canPush=false when the GitHub API throws an error", async () => {
    vi.mocked(getInstallationOctokit).mockRejectedValue(new Error("network error"));

    const result = await canPushToGitHubBranch({
      installationId: 123,
      repositoryFullName: "owner/repo",
      branch: "main",
    });

    expect(result.canPush).toBe(false);
    expect(result.reason).toContain("network error");
  });
});
