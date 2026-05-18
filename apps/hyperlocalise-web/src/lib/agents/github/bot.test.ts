import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Message, Thread } from "chat";

const {
  addInteractionMessageMock,
  agentGenerateMock,
  createHyperlocaliseAgentMock,
  createInteractionMock,
  findInteractionBySourceThreadIdMock,
  buildGitHubFixRequestInputMock,
  claimGitHubAgentRequestMock,
  loadMessagesMock,
  markGitHubAgentRequestEnqueuedMock,
  selectMock,
} = vi.hoisted(() => ({
  addInteractionMessageMock: vi.fn(),
  agentGenerateMock: vi.fn(),
  buildGitHubFixRequestInputMock: vi.fn((event: unknown) => ({
    requestKind: "fix",
    githubInstallationId: "54321",
    repositoryFullName: "owner/repo",
    pullRequestNumber: 42,
    commentId: "123",
    scopeType: "review_comment",
    scopeKey: JSON.stringify(event),
  })),
  claimGitHubAgentRequestMock: vi.fn(),
  createHyperlocaliseAgentMock: vi.fn((_settings: unknown) => ({
    generate: agentGenerateMock,
  })),
  createInteractionMock: vi.fn(),
  findInteractionBySourceThreadIdMock: vi.fn(),
  loadMessagesMock: vi.fn(async () => [{ role: "user", content: "@hyperlocalise fix" }]),
  markGitHubAgentRequestEnqueuedMock: vi.fn(),
  selectMock: vi.fn(),
}));

vi.mock("@/lib/agents/hyperlocalise-agent", () => {
  return {
    createHyperlocaliseAgent: createHyperlocaliseAgentMock,
    loadInteractionModelMessages: loadMessagesMock,
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

vi.mock("@/lib/interactions", () => ({
  addInteractionMessage: addInteractionMessageMock,
  createInteraction: createInteractionMock,
  findInteractionBySourceThreadId: findInteractionBySourceThreadIdMock,
}));

vi.mock("@/lib/agents/github/request-idempotency", () => ({
  buildGitHubFixRequestInput: buildGitHubFixRequestInputMock,
  claimGitHubAgentRequest: claimGitHubAgentRequestMock,
  markGitHubAgentRequestEnqueued: markGitHubAgentRequestEnqueuedMock,
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
  const posts: unknown[] = [];
  const setStateMock = vi.fn(async () => undefined);
  const thread = {
    id: "github:owner/repo:pull/42",
    post: vi.fn(async (message: unknown) => {
      posts.push(message);
      return { id: "sent_123" };
    }),
    setState: setStateMock,
    adapter: {
      addReaction: addReactionMock,
      getInstallationId: vi.fn(async () => "54321"),
    },
  } as unknown as Thread<Record<string, unknown>>;

  return { addReactionMock, posts, setStateMock, thread };
}

function createMessage(input: { text?: string; raw?: Record<string, unknown> } = {}): Message {
  return {
    id: "comment_123",
    threadId: "github:owner/repo:pull/42",
    text: input.text ?? "@hyperlocalise fix vi",
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
    agentGenerateMock.mockResolvedValue({ text: "Queued the fix workflow." });
    addInteractionMessageMock.mockResolvedValue({ id: "msg_123" });
    claimGitHubAgentRequestMock.mockResolvedValue({
      alreadyQueued: false,
      requestId: "request_123",
    });
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
    const queue = { enqueue: vi.fn() };

    await handleMention(thread, createMessage({ text: "@hyperlocalise status" }), { queue });

    expect(createHyperlocaliseAgentMock).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(addReactionMock).not.toHaveBeenCalled();
  });

  it("validates PR context before invoking the agent", async () => {
    const { posts, thread } = createThread();
    const queue = { enqueue: vi.fn() };

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
      { queue },
    );

    expect(createHyperlocaliseAgentMock).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(posts).toEqual([
      "I can only run `@hyperlocalise fix` from pull request comments or inline pull request review comments.",
    ]);
  });

  it("routes fix through a restricted ToolLoopAgent tool", async () => {
    const { addReactionMock, posts, setStateMock, thread } = createThread();
    const queue = { enqueue: vi.fn(async () => ({ ids: ["run_123"] })) };
    createHyperlocaliseAgentMock.mockImplementationOnce((settings: unknown) => {
      const { tools } = settings as {
        tools: {
          enqueueGitHubFix: { execute?: (input: Record<string, never>) => Promise<unknown> };
        };
      };
      return {
        generate: vi.fn(async () => {
          await tools.enqueueGitHubFix.execute?.({});
          return { text: "Queued the fix workflow." };
        }),
      };
    });

    await handleMention(thread, createMessage(), { queue });

    expect(createHyperlocaliseAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "github",
        projectId: null,
        activeTools: ["enqueueGitHubFix"],
      }),
    );
    const agentSettings = createHyperlocaliseAgentMock.mock.calls[0]?.[0] as
      | { tools?: unknown }
      | undefined;
    expect(agentSettings?.tools).toEqual(
      expect.objectContaining({
        enqueueGitHubFix: expect.objectContaining({
          description: expect.stringContaining("Queue the validated GitHub"),
        }),
      }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryFullName: "owner/repo",
        pullRequestNumber: 42,
        scope: expect.objectContaining({
          type: "review_comment",
          locale: "vi",
        }),
      }),
    );
    expect(buildGitHubFixRequestInputMock).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryFullName: "owner/repo",
        pullRequestNumber: 42,
        trigger: expect.objectContaining({ commentId: 123 }),
        scope: expect.objectContaining({
          type: "review_comment",
          locale: "vi",
        }),
      }),
    );
    expect(claimGitHubAgentRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestKind: "fix",
        githubInstallationId: "54321",
        repositoryFullName: "owner/repo",
        pullRequestNumber: 42,
      }),
    );
    expect(markGitHubAgentRequestEnqueuedMock).toHaveBeenCalledWith({
      requestId: "request_123",
      workflowRunIds: ["run_123"],
    });
    expect(addReactionMock).toHaveBeenCalledWith(thread.id, "comment_123", expect.anything());
    expect(setStateMock).toHaveBeenCalledWith({
      lastFixEvent: expect.objectContaining({
        repositoryFullName: "owner/repo",
      }),
    });
    expect(addInteractionMessageMock).toHaveBeenCalledWith({
      interactionId: "interaction_123",
      senderType: "user",
      text: "@hyperlocalise fix vi",
    });
    expect(posts).toEqual(["Queued the fix workflow."]);
  });

  it("does not enqueue again when the persistent GitHub fix claim already exists", async () => {
    const { posts, thread } = createThread();
    const queue = { enqueue: vi.fn(async () => ({ ids: ["run_new"] })) };
    claimGitHubAgentRequestMock.mockResolvedValueOnce({
      alreadyQueued: true,
      requestId: "request_123",
      workflowRunIds: ["run_existing"],
    });
    createHyperlocaliseAgentMock.mockImplementationOnce((settings: unknown) => {
      const { tools } = settings as {
        tools: {
          enqueueGitHubFix: { execute?: (input: Record<string, never>) => Promise<unknown> };
        };
      };
      return {
        generate: vi.fn(async () => {
          const toolResult = await tools.enqueueGitHubFix.execute?.({});
          expect(toolResult).toEqual(
            expect.objectContaining({
              alreadyQueued: true,
              workflowRunIds: ["run_existing"],
            }),
          );
          return { text: "This fix request is already queued." };
        }),
      };
    });

    await handleMention(thread, createMessage(), { queue });

    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(markGitHubAgentRequestEnqueuedMock).not.toHaveBeenCalled();
    expect(posts).toEqual(["This fix request is already queued."]);
  });
});
