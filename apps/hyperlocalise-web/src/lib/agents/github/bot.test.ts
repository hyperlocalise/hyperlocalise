import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Message, Thread } from "chat";

const {
  addInteractionMessageMock,
  buildGitHubRepositoryRequestInputMock,
  claimGitHubAgentRequestMock,
  createInteractionMock,
  findInteractionBySourceThreadIdMock,
  markGitHubAgentRequestEnqueuedMock,
  createRepositoryAgentTaskQueueMock,
  getInstallationOctokitMock,
  releaseGitHubAgentRequestClaimMock,
  repositoryQueueEnqueueMock,
  selectMock,
} = vi.hoisted(() => {
  const repositoryQueueEnqueueMock = vi.fn();

  return {
    addInteractionMessageMock: vi.fn(),
    buildGitHubRepositoryRequestInputMock: vi.fn((input: unknown) => ({
      requestKind: "repository",
      githubInstallationId: "54321",
      repositoryFullName: "owner/repo",
      pullRequestNumber: 42,
      commentId: "123",
      scopeType: "repository",
      scopeKey: JSON.stringify(input),
    })),
    claimGitHubAgentRequestMock: vi.fn(),
    createInteractionMock: vi.fn(),
    createRepositoryAgentTaskQueueMock: vi.fn(() => ({
      enqueue: repositoryQueueEnqueueMock,
    })),
    findInteractionBySourceThreadIdMock: vi.fn(),
    markGitHubAgentRequestEnqueuedMock: vi.fn(),
    getInstallationOctokitMock: vi.fn(async () => ({
      rest: {
        pulls: {
          get: vi.fn(async () => ({
            data: {
              head: {
                ref: "feature/i18n",
                sha: "head-sha",
              },
            },
          })),
        },
        repos: {
          getCollaboratorPermissionLevel: vi.fn(async () => ({
            data: { permission: "write" },
          })),
        },
      },
    })),
    releaseGitHubAgentRequestClaimMock: vi.fn(),
    repositoryQueueEnqueueMock,
    selectMock: vi.fn(),
  };
});

vi.mock("@/lib/database", () => ({
  db: {
    select: selectMock,
  },
  schema: {
    githubInstallations: {
      githubInstallationId: "githubInstallationId",
      organizationId: "organizationId",
    },
  },
}));

vi.mock("@/lib/conversations/interactions", () => ({
  addInteractionMessage: addInteractionMessageMock,
  createInteraction: createInteractionMock,
  findInteractionBySourceThreadId: findInteractionBySourceThreadIdMock,
}));

vi.mock("@/lib/agents/github/request-idempotency", () => ({
  buildGitHubRepositoryRequestInput: buildGitHubRepositoryRequestInputMock,
  claimGitHubAgentRequest: claimGitHubAgentRequestMock,
  markGitHubAgentRequestEnqueued: markGitHubAgentRequestEnqueuedMock,
  releaseGitHubAgentRequestClaim: releaseGitHubAgentRequestClaimMock,
}));

vi.mock("@/workflows/adapters", () => ({
  createRepositoryAgentTaskQueue: createRepositoryAgentTaskQueueMock,
}));

vi.mock("@/lib/agents/github/app", () => ({
  getInstallationOctokit: getInstallationOctokitMock,
}));

vi.mock("@/lib/agents/runtime/state", () => ({
  createChatStateAdapter: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    GITHUB_APP_ID: "app_123",
    GITHUB_APP_PRIVATE_KEY: "private-key",
    GITHUB_APP_WEBHOOK_SECRET: "secret",
    OPENAI_API_KEY: "openai-key",
  },
}));

import { handleMention } from "./bot";

function createThread() {
  const addReactionMock = vi.fn(async () => undefined);
  const getInstallationIdMock = vi.fn(async (): Promise<string | null> => "54321");
  const posts: unknown[] = [];
  const thread = {
    id: "github:owner/repo:pull/42",
    post: vi.fn(async (message: unknown) => {
      posts.push(message);
      return { id: "sent_123" };
    }),
    adapter: {
      addReaction: addReactionMock,
      getInstallationId: getInstallationIdMock,
    },
  } as unknown as Thread<Record<string, never>>;

  return { addReactionMock, getInstallationIdMock, posts, thread };
}

function createMessage(input: { text?: string; raw?: Record<string, unknown> } = {}): Message {
  return {
    id: "comment_123",
    threadId: "github:owner/repo:pull/42",
    text: input.text ?? "@hyperlocalise sync repo translations",
    raw:
      input.raw ??
      ({
        type: "pull_request_review_comment",
        repository: { full_name: "owner/repo" },
        prNumber: 42,
        comment: {
          id: 123,
          path: "app.ts",
          line: 10,
          original_line: 10,
          side: "RIGHT",
          commit_id: "abc123",
        },
      } satisfies Record<string, unknown>),
    author: {
      userId: "octocat",
      userName: "octocat",
      fullName: "Octo Cat",
      isBot: false,
      isMe: false,
    },
    metadata: { dateSent: new Date(), edited: false },
    formatted: { type: "root", children: [] },
  } as unknown as Message;
}

function mockOrganizationLookup(organizationId: string | null) {
  selectMock.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => (organizationId ? [{ organizationId }] : [])),
      })),
    })),
  });
}

describe("GitHub command routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrganizationLookup("org_123");
    addInteractionMessageMock.mockResolvedValue({ id: "msg_123" });
    claimGitHubAgentRequestMock.mockResolvedValue({
      alreadyQueued: false,
      requestId: "request_123",
    });
    repositoryQueueEnqueueMock.mockResolvedValue({ ids: ["repository_run_123"] });
    findInteractionBySourceThreadIdMock.mockResolvedValue(null);
    markGitHubAgentRequestEnqueuedMock.mockResolvedValue(undefined);
    createInteractionMock.mockResolvedValue({
      id: "interaction_123",
      title: "owner/repo#42",
      projectId: null,
    });
  });

  it("ignores unknown commands", async () => {
    const { addReactionMock, thread } = createThread();

    await handleMention(thread, createMessage({ text: "@octocat status" }));

    expect(createRepositoryAgentTaskQueueMock).not.toHaveBeenCalled();
    expect(addReactionMock).not.toHaveBeenCalled();
  });

  it("ignores an empty hyperlocalise mention", async () => {
    const { addReactionMock, thread } = createThread();

    await handleMention(thread, createMessage({ text: "@hyperlocalise" }));

    expect(createRepositoryAgentTaskQueueMock).not.toHaveBeenCalled();
    expect(addReactionMock).not.toHaveBeenCalled();
  });

  it("rejects fix commands", async () => {
    const { addReactionMock, posts, thread } = createThread();

    await handleMention(thread, createMessage({ text: "@hyperlocalise fix vi" }));

    expect(createRepositoryAgentTaskQueueMock).not.toHaveBeenCalled();
    expect(addReactionMock).not.toHaveBeenCalled();
    expect(posts).toEqual([
      "The `@hyperlocalise fix` command is not available right now. Use `@hyperlocalise` with instructions to run a read-only repository workflow instead.",
    ]);
  });

  it("uses a command-neutral message when GitHub App installation is missing", async () => {
    const { getInstallationIdMock, posts, thread } = createThread();
    getInstallationIdMock.mockResolvedValueOnce(null);

    await handleMention(thread, createMessage({ text: "@hyperlocalise sync repo translations" }));

    expect(createRepositoryAgentTaskQueueMock).not.toHaveBeenCalled();
    expect(posts).toEqual(["GitHub App installation is not configured for `@hyperlocalise`."]);
  });

  it("validates PR context before invoking the agent", async () => {
    const { posts, thread } = createThread();

    await handleMention(
      thread,
      createMessage({
        raw: {
          type: "issue_comment",
          threadType: "issue",
          repository: { full_name: "owner/repo" },
          prNumber: 42,
          comment: { id: 123 },
        },
      }),
    );

    expect(createRepositoryAgentTaskQueueMock).not.toHaveBeenCalled();
    expect(posts).toEqual([
      "I can only run `@hyperlocalise` from pull request comments or inline pull request review comments.",
    ]);
  });

  it("denies repository commands when collaborator permission lookup fails", async () => {
    const { posts, thread } = createThread();
    getInstallationOctokitMock.mockResolvedValueOnce({
      rest: {
        pulls: {
          get: vi.fn(async () => ({
            data: { head: { ref: "feature/i18n", sha: "head-sha" } },
          })),
        },
        repos: {
          getCollaboratorPermissionLevel: vi.fn(async () => {
            throw Object.assign(new Error("not found"), { status: 404 });
          }),
        },
      },
    });

    await handleMention(thread, createMessage({ text: "@hyperlocalise sync repo translations" }));

    expect(createRepositoryAgentTaskQueueMock).not.toHaveBeenCalled();
    expect(repositoryQueueEnqueueMock).not.toHaveBeenCalled();
    expect(posts).toEqual([
      "I can only run `@hyperlocalise` commands for repository collaborators with write access.",
    ]);
  });

  it("does not add the repository reaction when the workspace cannot be resolved", async () => {
    const { addReactionMock, posts, thread } = createThread();
    mockOrganizationLookup(null);

    await handleMention(thread, createMessage({ text: "@hyperlocalise sync repo translations" }));

    expect(repositoryQueueEnqueueMock).not.toHaveBeenCalled();
    expect(addReactionMock).not.toHaveBeenCalled();
    expect(posts).toEqual([
      "I could not resolve the Hyperlocalise workspace for this GitHub installation.",
    ]);
  });

  it("reports repository claim failures before adding the reaction", async () => {
    const { addReactionMock, posts, thread } = createThread();
    claimGitHubAgentRequestMock.mockRejectedValueOnce(new Error("claimed"));

    await expect(
      handleMention(thread, createMessage({ text: "@hyperlocalise sync repo translations" })),
    ).rejects.toThrow("claimed");

    expect(repositoryQueueEnqueueMock).not.toHaveBeenCalled();
    expect(addReactionMock).not.toHaveBeenCalled();
    expect(posts).toEqual([
      "I could not queue this repository workflow right now. Please try again in a moment.",
    ]);
  });

  it("queues repository workflows", async () => {
    const { addReactionMock, posts, thread } = createThread();

    await handleMention(thread, createMessage({ text: "@hyperlocalise sync repo translations" }));

    expect(repositoryQueueEnqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "github",
        instructions: "sync repo translations",
        organizationId: "org_123",
      }),
    );
    expect(markGitHubAgentRequestEnqueuedMock).toHaveBeenCalledWith({
      requestId: "request_123",
      workflowRunIds: ["repository_run_123"],
    });
    expect(addReactionMock).toHaveBeenCalledWith(thread.id, "comment_123", expect.anything());
    expect(posts).toEqual([expect.stringContaining("Queued your repository workflow.")]);
  });
});
