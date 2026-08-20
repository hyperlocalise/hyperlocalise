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
  return {
    api: {
      orgs: {
        ":organizationSlug": {
          conversations: {
            $get: vi.fn(),
            ":conversationId": {
              messages: { $get: vi.fn() },
              jobs: { $get: vi.fn() },
            },
          },
          "github-installation": {
            repositories: { $get: vi.fn() },
          },
        },
      },
    },
  } as never;
}

describe("createInboxApi FormData", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("substitutes file-only placeholder text when createConversation text is blank", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          conversation: { id: "conv_1", title: "File request" },
          message: { id: "msg_1", text: FILE_ONLY_CONVERSATION_TEXT },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const api = createInboxApi(stubInboxApiClient());
    const file = new File(["source"], "source.json", { type: "application/json" });

    await api.createConversation("acme", {
      text: "   ",
      files: [file],
      projectId: "project_1",
      repositoryFullName: "acme/web",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/orgs/acme/conversations");
    expect(init.method).toBe("POST");
    const formData = init.body as FormData;
    expect(formData.get("text")).toBe(FILE_ONLY_CONVERSATION_TEXT);
    expect(formData.get("projectId")).toBe("project_1");
    expect(formData.get("repositoryFullName")).toBe("acme/web");
    expect(formData.getAll("files")).toHaveLength(1);
  });

  it("preserves trimmed createConversation text and does not rewrite sendMessage blanks", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ conversation: { id: "conv_2" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const api = createInboxApi(stubInboxApiClient());

    await api.createConversation("acme", {
      text: "  Translate this UI  ",
      files: [],
    });
    const createForm = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    expect(createForm.get("text")).toBe("Translate this UI");

    await api.sendMessage("acme", "conv_2", {
      text: "   ",
      files: [],
    });
    const sendForm = (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as FormData;
    // Reply path keeps the raw text; only new-request compose substitutes file-only copy.
    expect(sendForm.get("text")).toBe("   ");
  });
});
