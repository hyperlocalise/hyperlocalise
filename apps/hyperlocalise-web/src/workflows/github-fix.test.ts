import { describe, expect, it, vi } from "vite-plus/test";

import type { GitHubFixRequestedEventData } from "@/lib/workflow/types";

vi.mock("@/lib/agents/github/app", () => ({
  getInstallationOctokit: vi.fn(),
}));

import { getCommittableChangedPaths, getScopedFixPreflightSkip } from "./github-fix";

function buildFixEvent(scope: GitHubFixRequestedEventData["scope"]): GitHubFixRequestedEventData {
  return {
    installationId: 123,
    repositoryOwner: "acme",
    repositoryName: "app",
    repositoryFullName: "acme/app",
    pullRequestNumber: 42,
    trigger: {
      event: scope.type === "review_comment" ? "pull_request_review_comment" : "issue_comment",
      action: "created",
      deliveryId: "delivery-1",
      commentId: 456,
      requesterLogin: "octocat",
    },
    scope,
  };
}

describe("github fix committable changed paths", () => {
  it("includes modified tracked translation files", () => {
    const paths = getCommittableChangedPaths(" M locales/en.json\0");

    expect(paths).toEqual(["locales/en.json"]);
  });

  it("includes untracked translation output files", () => {
    const paths = getCommittableChangedPaths("?? apps/web/messages/fr.json\0");

    expect(paths).toEqual(["apps/web/messages/fr.json"]);
  });

  it("excludes internal Hyperlocalise reports", () => {
    const paths = getCommittableChangedPaths(
      [
        "?? .hyperlocalise/fix-report.json",
        "?? .hyperlocalise/scoped-check-report.json",
        " M locales/en.json",
      ].join("\0") + "\0",
    );

    expect(paths).toEqual(["locales/en.json"]);
  });

  it("skips the original path entry for staged renames", () => {
    const paths = getCommittableChangedPaths("R  new.json\0old.json\0");

    expect(paths).toEqual(["new.json"]);
  });

  it("skips the original path entry for staged copies", () => {
    const paths = getCommittableChangedPaths("C  copied.json\0source.json\0");

    expect(paths).toEqual(["copied.json"]);
  });

  it("returns no committable paths for report-only output", () => {
    const paths = getCommittableChangedPaths("?? .hyperlocalise/fix-report.json\0");

    expect(paths).toEqual([]);
  });

  it("consumes original path entries when filtered renames target reports", () => {
    const paths = getCommittableChangedPaths(
      "R  .hyperlocalise/fix-report.json\0old.json\0 M locales/en.json\0",
    );

    expect(paths).toEqual(["locales/en.json"]);
  });
});

describe("github fix scoped preflight", () => {
  it("skips scoped fixes when the reviewed commit is no longer the PR head", () => {
    const skip = getScopedFixPreflightSkip(
      buildFixEvent({
        type: "review_comment",
        path: "locales/en.json",
        line: 12,
        originalLine: 12,
        side: "RIGHT",
        commitSha: "1111111111111111111111111111111111111111",
        locale: "fr",
      }),
      { headSha: "2222222222222222222222222222222222222222" },
    );

    expect(skip).toEqual({
      skipped: true,
      reason:
        "This inline comment was made against commit `111111111111`, but the PR head is now `222222222222`. I skipped the scoped fix so it does not target the wrong line or translation entry. Comment `@hyperlocalise fix` on the PR conversation to run a broad fix on the current head.",
    });
  });

  it("skips scoped fixes when the reviewed commit cannot be verified", () => {
    const skip = getScopedFixPreflightSkip(
      buildFixEvent({
        type: "review_comment",
        path: "locales/en.json",
        line: 12,
        originalLine: 12,
        side: "RIGHT",
        commitSha: null,
        locale: "fr",
      }),
      { headSha: "2222222222222222222222222222222222222222" },
    );

    expect(skip).toEqual({
      skipped: true,
      reason:
        "I could not verify which commit this inline comment was made against, so I skipped the scoped fix. Comment `@hyperlocalise fix` on the PR conversation to run a broad fix.",
    });
  });

  it("allows scoped fixes when the reviewed commit is still the PR head", () => {
    const skip = getScopedFixPreflightSkip(
      buildFixEvent({
        type: "review_comment",
        path: "locales/en.json",
        line: 12,
        originalLine: 12,
        side: "RIGHT",
        commitSha: "1111111111111111111111111111111111111111",
        locale: "fr",
      }),
      { headSha: "1111111111111111111111111111111111111111" },
    );

    expect(skip).toBeNull();
  });

  it("keeps broad PR-level fixes supported without a head-sha match", () => {
    const skip = getScopedFixPreflightSkip(
      buildFixEvent({
        type: "pull_request",
      }),
      { headSha: "2222222222222222222222222222222222222222" },
    );

    expect(skip).toBeNull();
  });
});
