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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createInboxApi } from "./inbox-api";

const FILE_ONLY_CONVERSATION_TEXT = "Please translate the attached source file.";

function stubInboxApiClient() {
  const createConversationPost = vi.fn();
  const sendMessagePost = vi.fn();
  const listGithubRepositoriesGet = vi.fn();
  const listGitlabProjectsGet = vi.fn();
  const listBitbucketRepositoriesGet = vi.fn(async () =>
    jsonResponse({ connected: false, repositories: [] }, 200),
  );
  const listConversations = vi.fn();
  const listMessages = vi.fn();
  const listJobs = vi.fn();
  return {
    createConversationPost,
    sendMessagePost,
    listGithubRepositoriesGet,
    listGitlabProjectsGet,
    listBitbucketRepositoriesGet,
    listConversations,
    listMessages,
    listJobs,
    conversationReads: {
      list: listConversations,
      listMessages,
      listJobs,
    },
    client: {
      api: {
        orgs: {
          ":organizationSlug": {
            conversations: {
              $post: createConversationPost,
              ":conversationId": {
                messages: { $post: sendMessagePost },
              },
            },
            "github-installation": {
              repositories: { $get: listGithubRepositoriesGet },
            },
            gitlab: {
              projects: { $get: listGitlabProjectsGet },
            },
            bitbucket: {
              repositories: { $get: listBitbucketRepositoriesGet },
            },
          },
        },
      },
    } as never,
  };
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createInboxApi FormData", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("substitutes file-only placeholder text when createConversation text is blank", async () => {
    const { client, createConversationPost } = stubInboxApiClient();
    createConversationPost.mockResolvedValue(
      jsonResponse(
        {
          conversation: { id: "conv_1", title: "File request" },
          message: { id: "msg_1", text: FILE_ONLY_CONVERSATION_TEXT },
        },
        201,
      ),
    );

    const api = createInboxApi(client);
    const file = new File(["source"], "source.json", { type: "application/json" });

    await api.createConversation("acme", {
      text: "   ",
      files: [file],
      projectId: "project_1",
      repositoryFullName: "acme/web",
    });

    expect(createConversationPost).toHaveBeenCalledTimes(1);
    expect(createConversationPost).toHaveBeenCalledWith({
      param: { organizationSlug: "acme" },
      form: {
        text: FILE_ONLY_CONVERSATION_TEXT,
        projectId: "project_1",
        repositoryFullName: "acme/web",
        files: [file],
      },
    });
  });

  it("preserves trimmed createConversation text and does not rewrite sendMessage blanks", async () => {
    const { client, createConversationPost, sendMessagePost } = stubInboxApiClient();
    createConversationPost.mockResolvedValue(jsonResponse({ conversation: { id: "conv_2" } }, 201));
    sendMessagePost.mockResolvedValue(jsonResponse({ message: { id: "msg_2" } }, 201));

    const api = createInboxApi(client);

    await api.createConversation("acme", {
      text: "  Translate this UI  ",
      files: [],
    });
    expect(createConversationPost).toHaveBeenCalledWith({
      param: { organizationSlug: "acme" },
      form: {
        text: "Translate this UI",
      },
    });

    await api.sendMessage("acme", "conv_2", {
      text: "   ",
      files: [],
    });
    expect(sendMessagePost).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", conversationId: "conv_2" },
      form: {
        text: "   ",
      },
    });
  });

  it("sends repositoryProvider with GitLab selections", async () => {
    const { client, createConversationPost } = stubInboxApiClient();
    createConversationPost.mockResolvedValue(jsonResponse({ conversation: { id: "conv_3" } }, 201));

    const api = createInboxApi(client);
    await api.createConversation("acme", {
      text: "Review this GitLab project",
      files: [],
      repositoryFullName: "acme/platform/web",
      repositoryProvider: "gitlab",
    });

    expect(createConversationPost).toHaveBeenCalledWith({
      param: { organizationSlug: "acme" },
      form: {
        text: "Review this GitLab project",
        repositoryFullName: "acme/platform/web",
        repositoryProvider: "gitlab",
      },
    });
  });

  it("merges GitHub repositories and GitLab projects into chat repository options", async () => {
    const { client, listGithubRepositoriesGet, listGitlabProjectsGet } = stubInboxApiClient();
    listGithubRepositoriesGet.mockResolvedValue(
      jsonResponse(
        {
          repositories: [
            {
              archived: false,
              defaultBranch: "main",
              enabled: true,
              fullName: "acme/web",
              name: "web",
            },
          ],
        },
        200,
      ),
    );
    listGitlabProjectsGet.mockResolvedValue(
      jsonResponse(
        {
          projects: [
            {
              archived: false,
              defaultBranch: "main",
              name: "docs",
              pathWithNamespace: "acme/platform/docs",
            },
          ],
        },
        200,
      ),
    );

    const api = createInboxApi(client);
    await expect(api.listChatRepositories("acme")).resolves.toEqual([
      {
        archived: false,
        defaultBranch: "main",
        enabled: true,
        fullName: "acme/web",
        name: "web",
        provider: "github",
        selectionKey: "github:acme/web",
      },
      {
        archived: false,
        defaultBranch: "main",
        enabled: true,
        fullName: "acme/platform/docs",
        name: "docs",
        provider: "gitlab",
        selectionKey: "gitlab:acme/platform/docs",
      },
    ]);
  });
});

describe("createInboxApi Bitbucket repositories", () => {
  it("adds the workspace's Bitbucket repositories to the chat repository options", async () => {
    const {
      client,
      listGithubRepositoriesGet,
      listGitlabProjectsGet,
      listBitbucketRepositoriesGet,
    } = stubInboxApiClient();
    listGithubRepositoriesGet.mockResolvedValue(jsonResponse({ error: "forbidden" }, 403));
    listGitlabProjectsGet.mockResolvedValue(jsonResponse({ projects: [] }, 200));
    listBitbucketRepositoriesGet.mockResolvedValue(
      jsonResponse(
        {
          connected: true,
          repositories: [{ uuid: "{repo-uuid}", fullName: "acme/web", mainBranch: "main" }],
        },
        200,
      ),
    );

    const api = createInboxApi(client);
    await expect(api.listChatRepositories("acme")).resolves.toEqual([
      {
        archived: false,
        defaultBranch: "main",
        enabled: true,
        fullName: "acme/web",
        name: "web",
        provider: "bitbucket",
        selectionKey: "bitbucket:acme/web",
      },
    ]);
  });

  it("still fails when no provider answers", async () => {
    const {
      client,
      listGithubRepositoriesGet,
      listGitlabProjectsGet,
      listBitbucketRepositoriesGet,
    } = stubInboxApiClient();
    listGithubRepositoriesGet.mockResolvedValue(jsonResponse({ error: "unavailable" }, 503));
    listGitlabProjectsGet.mockResolvedValue(jsonResponse({ error: "unavailable" }, 503));
    listBitbucketRepositoriesGet.mockResolvedValue(
      jsonResponse({ error: "bitbucket_unavailable" }, 503),
    );

    await expect(createInboxApi(client).listChatRepositories("acme")).rejects.toThrow();
  });

  it("sends the Bitbucket provider with a selected repository", async () => {
    const { client, createConversationPost } = stubInboxApiClient();
    createConversationPost.mockResolvedValue(
      jsonResponse(
        {
          conversation: { id: "conv_1" },
          message: { id: "msg_1" },
          files: [],
        },
        201,
      ),
    );

    await createInboxApi(client)
      .createConversation("acme", {
        text: "Where is Checkout?",
        repositoryFullName: "acme/web",
        repositoryProvider: "bitbucket",
        files: [],
      })
      .catch(() => undefined);

    expect(createConversationPost).toHaveBeenCalledWith(
      expect.objectContaining({
        form: expect.objectContaining({
          repositoryFullName: "acme/web",
          repositoryProvider: "bitbucket",
        }),
      }),
    );
  });
});

describe("createInboxApi conversation reads", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads conversations, messages, and jobs from go-svc", async () => {
    const { client, conversationReads, listConversations, listMessages, listJobs } =
      stubInboxApiClient();
    listConversations.mockResolvedValue({
      conversations: [{ id: "conv_1", title: "Translate docs" }],
    });
    listMessages.mockResolvedValue({
      messages: [
        {
          id: "msg_1",
          interactionId: "conv_1",
          senderType: "user",
          senderEmail: "ada@example.com",
          text: "Please translate",
          parts: null,
          attachments: [
            { id: "file_1", filename: "en.json", contentType: "application/json", url: "/file" },
          ],
          createdAt: "2026-03-04T05:06:07.891Z",
        },
      ],
    });
    listJobs.mockResolvedValue({
      jobs: [
        {
          id: "job_1",
          projectId: null,
          kind: "translation",
          type: "file",
          status: "queued",
          outcomeKind: null,
          createdAt: "2026-03-04T05:06:07.891Z",
          completedAt: null,
        },
      ],
    });

    const api = createInboxApi(client, conversationReads);
    await expect(api.listConversations("acme", 25)).resolves.toEqual([
      { id: "conv_1", title: "Translate docs" },
    ]);
    await expect(api.listMessages("acme", "conv_1")).resolves.toEqual([
      {
        id: "msg_1",
        conversationId: "conv_1",
        senderType: "user",
        senderEmail: "ada@example.com",
        text: "Please translate",
        parts: null,
        attachments: [
          { id: "file_1", filename: "en.json", contentType: "application/json", url: "/file" },
        ],
        createdAt: "2026-03-04T05:06:07.891Z",
      },
    ]);
    await expect(api.listLinkedJobs("acme", "conv_1")).resolves.toEqual([
      {
        id: "job_1",
        projectId: null,
        kind: "translation",
        type: "file",
        status: "queued",
        outcomeKind: null,
        createdAt: "2026-03-04T05:06:07.891Z",
        completedAt: null,
      },
    ]);

    expect(listConversations).toHaveBeenCalledWith("acme", { limit: 25 });
    expect(listMessages).toHaveBeenCalledWith("acme", "conv_1");
    expect(listJobs).toHaveBeenCalledWith("acme", "conv_1");
  });
});
