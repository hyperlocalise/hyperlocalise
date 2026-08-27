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
  return {
    createConversationPost,
    sendMessagePost,
    client: {
      api: {
        orgs: {
          ":organizationSlug": {
            conversations: {
              $get: vi.fn(),
              $post: createConversationPost,
              ":conversationId": {
                messages: { $get: vi.fn(), $post: sendMessagePost },
                jobs: { $get: vi.fn() },
              },
            },
            "github-installation": {
              repositories: { $get: vi.fn() },
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
});
