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
import { describe, expect, it } from "vite-plus/test";

import { repositoryWorkspaceToolNames } from "@/lib/agent-contracts/repository-workspace-tools";

import {
  conversationFileTranslationToolNames,
  getConversationActiveTools,
} from "./conversation-tools";

function toolContext(sandboxId?: string) {
  return {
    conversationId: "conv_1",
    organizationId: "org_1",
    localUserId: "user_1",
    membershipRole: "member" as const,
    projectId: null,
    sandboxId,
    db: {} as never,
  };
}

describe("getConversationActiveTools", () => {
  it("exposes file translation tools only when attachments are present", () => {
    expect(getConversationActiveTools(toolContext())).toEqual([]);
    expect(
      getConversationActiveTools(toolContext(), { hasFileAttachments: true }),
    ).toEqual([...conversationFileTranslationToolNames]);
  });

  it("gates repository tools on sandbox availability in translation mode", () => {
    expect(
      getConversationActiveTools(toolContext(), {
        mode: "translation",
        hasFileAttachments: true,
      }),
    ).toEqual([...conversationFileTranslationToolNames]);

    expect(
      getConversationActiveTools(toolContext("sandbox_1"), {
        mode: "translation",
        hasFileAttachments: true,
      }),
    ).toEqual([
      ...conversationFileTranslationToolNames,
      ...repositoryWorkspaceToolNames,
    ]);
  });

  it("limits repository mode to sandbox-backed repo tools", () => {
    expect(
      getConversationActiveTools(toolContext(), {
        mode: "repository",
        hasFileAttachments: true,
      }),
    ).toEqual([]);

    expect(
      getConversationActiveTools(toolContext("sandbox_1"), {
        mode: "repository",
        hasFileAttachments: true,
      }),
    ).toEqual([...repositoryWorkspaceToolNames]);
  });
});
