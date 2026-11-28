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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  loadBitbucketAccess: vi.fn(),
  resolveBitbucketCredentialOwner: vi.fn(),
  getBitbucketRepository: vi.fn(),
  getBitbucketPullRequest: vi.fn(),
}));

vi.mock("./pipes", () => ({
  loadBitbucketAccess: mocks.loadBitbucketAccess,
  resolveBitbucketCredentialOwner: mocks.resolveBitbucketCredentialOwner,
}));

vi.mock("./client", () => ({
  getBitbucketRepository: mocks.getBitbucketRepository,
  getBitbucketPullRequest: mocks.getBitbucketPullRequest,
}));

import { err, ok } from "@/lib/primitives/result/results";

import {
  buildRepositoryBitbucketContextInstructions,
  keepBitbucketContextIfConnected,
  loadBitbucketRepositoryContext,
  resolveConversationRepositoryBitbucketContext,
} from "./repository-context";

const repository = {
  uuid: "{repo-uuid}",
  fullName: "acme/web",
  name: "web",
  mainBranch: "main",
};

describe("bitbucket repository context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadBitbucketAccess.mockResolvedValue(ok({ accessToken: "token" }));
    mocks.getBitbucketRepository.mockResolvedValue(ok(repository));
  });

  it("resolves a repository on its main branch", async () => {
    await expect(
      loadBitbucketRepositoryContext({
        localOrganizationId: "org_1",
        repositoryFullName: "acme/web",
      }),
    ).resolves.toEqual(
      ok({
        resolved: true,
        provider: "bitbucket",
        repositoryUuid: "{repo-uuid}",
        repositoryFullName: "acme/web",
        branch: "main",
      }),
    );
    expect(mocks.getBitbucketRepository).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "token", fullName: "acme/web" }),
    );
  });

  it("reads a pull request from its source branch", async () => {
    mocks.getBitbucketPullRequest.mockResolvedValue(
      ok({
        id: 42,
        sourceBranch: "feature/copy",
        sourceRepositoryFullName: "acme/web",
        destinationBranch: "main",
      }),
    );

    const result = await loadBitbucketRepositoryContext({
      localOrganizationId: "org_1",
      repositoryFullName: "acme/web",
      pullRequestId: 42,
    });

    expect(result).toEqual(
      ok(expect.objectContaining({ pullRequestId: 42, branch: "feature/copy" })),
    );
  });

  it("reads a pull request from a fork on the branch it targets", async () => {
    mocks.getBitbucketPullRequest.mockResolvedValue(
      ok({
        id: 7,
        sourceBranch: "fork-branch",
        sourceRepositoryFullName: "someone/web",
        destinationBranch: "release",
      }),
    );

    const result = await loadBitbucketRepositoryContext({
      localOrganizationId: "org_1",
      repositoryFullName: "acme/web",
      pullRequestId: 7,
    });

    expect(result).toEqual(ok(expect.objectContaining({ pullRequestId: 7, branch: "release" })));
  });

  it("doesn't ask Bitbucket about a name that isn't a repository", async () => {
    const result = await loadBitbucketRepositoryContext({
      localOrganizationId: "org_1",
      repositoryFullName: "acme",
    });

    expect(result).toEqual(err(expect.objectContaining({ code: "bitbucket_not_found" })));
    expect(mocks.loadBitbucketAccess).not.toHaveBeenCalled();
  });

  it("is not applicable when the text has no Bitbucket link", async () => {
    await expect(
      resolveConversationRepositoryBitbucketContext({
        organizationId: "org_1",
        text: "where is 'Checkout' used in https://github.com/acme/web?",
      }),
    ).resolves.toEqual({ status: "not_applicable" });
    expect(mocks.loadBitbucketAccess).not.toHaveBeenCalled();
  });

  it("resolves a repository link in chat", async () => {
    const resolution = await resolveConversationRepositoryBitbucketContext({
      organizationId: "org_1",
      text: "find 'Checkout' in https://bitbucket.org/acme/web/src/main/",
    });

    expect(resolution).toEqual({
      status: "resolved",
      context: expect.objectContaining({ repositoryFullName: "acme/web", branch: "main" }),
    });
  });

  it("resolves a pull request link before the repository it is in", async () => {
    mocks.getBitbucketPullRequest.mockResolvedValue(
      ok({
        id: 42,
        sourceBranch: "feature/copy",
        sourceRepositoryFullName: "acme/web",
        destinationBranch: "main",
      }),
    );

    const resolution = await resolveConversationRepositoryBitbucketContext({
      organizationId: "org_1",
      text: "review https://bitbucket.org/acme/web/pull-requests/42",
    });

    expect(resolution).toEqual({
      status: "resolved",
      context: expect.objectContaining({ pullRequestId: 42, branch: "feature/copy" }),
    });
  });

  it("asks which repository when more than one is linked", async () => {
    const resolution = await resolveConversationRepositoryBitbucketContext({
      organizationId: "org_1",
      text: "https://bitbucket.org/acme/web https://bitbucket.org/acme/mobile",
    });

    expect(resolution).toEqual({
      status: "unresolved",
      followUp: expect.stringContaining("more than one Bitbucket repository"),
    });
    expect(mocks.getBitbucketRepository).not.toHaveBeenCalled();
  });

  it("says Bitbucket isn't connected without naming how it connects", async () => {
    mocks.loadBitbucketAccess.mockResolvedValue(
      err({ code: "bitbucket_not_connected", message: "Connect Bitbucket" }),
    );

    const resolution = await resolveConversationRepositoryBitbucketContext({
      organizationId: "org_1",
      text: "https://bitbucket.org/acme/web",
    });

    expect(resolution.status).toBe("unresolved");
    const followUp = resolution.status === "unresolved" ? resolution.followUp : "";
    expect(followUp).toContain("hasn't connected Bitbucket");
    expect(followUp).not.toMatch(/token|oauth|pipes/i);
  });

  it("explains a repository the connection can't open", async () => {
    mocks.getBitbucketRepository.mockResolvedValue(
      err({ code: "bitbucket_not_found", message: "Bitbucket could not find that." }),
    );

    const resolution = await resolveConversationRepositoryBitbucketContext({
      organizationId: "org_1",
      text: "https://bitbucket.org/acme/secret",
    });

    expect(resolution).toEqual({
      status: "unresolved",
      followUp: expect.stringContaining("can't open it"),
    });
  });

  it("drops a stored repository once Bitbucket is disconnected", async () => {
    const context = {
      resolved: true as const,
      provider: "bitbucket" as const,
      repositoryUuid: "{repo-uuid}",
      repositoryFullName: "acme/web",
    };

    mocks.resolveBitbucketCredentialOwner.mockResolvedValueOnce("bitbucket-connection:user_1");
    await expect(
      keepBitbucketContextIfConnected({ localOrganizationId: "org_1", context }),
    ).resolves.toBe(context);

    mocks.resolveBitbucketCredentialOwner.mockResolvedValueOnce(null);
    await expect(
      keepBitbucketContextIfConnected({ localOrganizationId: "org_1", context }),
    ).resolves.toBeNull();

    await expect(
      keepBitbucketContextIfConnected({ localOrganizationId: "org_1", context: undefined }),
    ).resolves.toBeNull();
    expect(mocks.resolveBitbucketCredentialOwner).toHaveBeenCalledTimes(2);
  });

  it("describes the resolved context for the agent", () => {
    expect(
      buildRepositoryBitbucketContextInstructions({
        resolved: true,
        provider: "bitbucket",
        repositoryUuid: "{repo-uuid}",
        repositoryFullName: "acme/web",
        pullRequestId: 42,
        branch: "feature/copy",
      }),
    ).toBe(
      [
        "Resolved Bitbucket repository context:",
        "- provider: bitbucket",
        "- repository: acme/web",
        "- pullRequestId: 42",
        "- branch: feature/copy",
      ].join("\n"),
    );
  });
});
