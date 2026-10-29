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
import { describe, expect, it, vi } from "vite-plus/test";
import type { CampaignResponse, EmailMessageResponse, TransactionalEmailResource } from "loops";

import { LoopsApiError, type LoopsClient } from "./client";
import { resolveCampaignCopy, resolveTransactionalCopy } from "./push-copy-resolution";

function notFound(message: string) {
  return new LoopsApiError({ message, status: 404 });
}

function fakeClient(overrides: Partial<LoopsClient> = {}): LoopsClient {
  const missing = async (name: string): Promise<never> => {
    throw new Error(`unexpected client call: ${name}`);
  };
  return {
    listTransactionalEmails: () => missing("listTransactionalEmails"),
    getEmailMessage: () => missing("getEmailMessage"),
    listCampaigns: () => missing("listCampaigns"),
    listWorkflows: () => missing("listWorkflows"),
    listWorkflowEmailNodes: () => missing("listWorkflowEmailNodes"),
    createTransactionalEmail: () => missing("createTransactionalEmail"),
    updateEmailMessage: () => missing("updateEmailMessage"),
    createCampaign: () => missing("createCampaign"),
    createWorkflow: () => missing("createWorkflow"),
    ensureTransactionalDraft: () => missing("ensureTransactionalDraft"),
    getCampaign: () => missing("getCampaign"),
    ...overrides,
  };
}

function transactionalItem(
  id: string,
  name: string,
  updatedAt = "2026-10-29T00:00:00.000Z",
): TransactionalEmailResource {
  return {
    id,
    url: `https://app.loops.so/transactional/${id}`,
    name,
    draftEmailMessageId: `draft-${id}`,
    publishedEmailMessageId: null,
    transactionalGroupId: null,
    createdAt: updatedAt,
    updatedAt,
    dataVariables: [],
  };
}

function campaignItem(
  id: string,
  name: string,
  updatedAt = "2026-10-29T00:00:00.000Z",
): CampaignResponse {
  return {
    id,
    url: `https://app.loops.so/campaigns/${id}`,
    name,
    status: "Draft" as const,
    createdAt: updatedAt,
    updatedAt,
    emailMessageId: `message-${id}`,
    campaignGroupId: null,
    mailingListId: null,
    audienceSegmentId: null,
    audienceFilter: null,
    scheduling: { method: "now" as const, timestamp: null },
  };
}

function emailMessage(
  id: string,
  contentRevisionId: string | null = "rev-1",
): EmailMessageResponse {
  return {
    id,
    subject: "Launch",
    previewText: "",
    fromName: "Team",
    fromEmail: "team@example.com",
    replyToEmail: "team@example.com",
    emailFormat: "styled" as const,
    lmx: "<Document />",
    contentRevisionId,
    updatedAt: "2026-10-29T00:00:00.000Z",
  };
}

describe("resolveTransactionalCopy", () => {
  it("uses the stored copy when its draft loads", async () => {
    const ensureTransactionalDraft = vi.fn(async () => ({
      ...transactionalItem("t1", "Welcome [vi-VN]"),
      draftEmailMessageContentRevisionId: "rev-1",
    }));
    const client = fakeClient({ ensureTransactionalDraft });

    const resolved = await resolveTransactionalCopy({
      client,
      storedCopyId: "t1",
      copyName: "Welcome [vi-VN]",
      pushWarning: () => {},
    });

    expect(resolved).toEqual({
      copyId: "t1",
      draftEmailMessageId: "draft-t1",
      expectedRevisionId: "rev-1",
    });
    expect(ensureTransactionalDraft).toHaveBeenCalledWith("t1");
  });

  it("adopts a same-named copy when the stored id is gone instead of duplicating", async () => {
    const createTransactionalEmail = vi.fn(async () => {
      throw new Error("must not create a duplicate");
    });
    const client = fakeClient({
      ensureTransactionalDraft: async (id: string) => {
        if (id === "stale") {
          throw notFound("404 - Transactional email not found");
        }
        return {
          ...transactionalItem(id, "Welcome [vi-VN]"),
          draftEmailMessageContentRevisionId: "rev-2",
        };
      },
      listTransactionalEmails: async () => [transactionalItem("t2", "Welcome [vi-VN]")],
      createTransactionalEmail,
    });
    const warnings: string[] = [];

    const resolved = await resolveTransactionalCopy({
      client,
      storedCopyId: "stale",
      copyName: "Welcome [vi-VN]",
      pushWarning: (message) => warnings.push(message),
    });

    expect(resolved.copyId).toBe("t2");
    expect(createTransactionalEmail).not.toHaveBeenCalled();
    expect(warnings).toEqual([]);
  });

  it("reuses the newest duplicate and warns about the extras", async () => {
    const client = fakeClient({
      listTransactionalEmails: async () => [
        transactionalItem("old", "Welcome [vi-VN]", "2026-10-27T00:00:00.000Z"),
        transactionalItem("new", "Welcome [vi-VN]", "2026-10-28T00:00:00.000Z"),
      ],
      ensureTransactionalDraft: async (id: string) => ({
        ...transactionalItem(id, "Welcome [vi-VN]"),
        draftEmailMessageContentRevisionId: "rev-3",
      }),
      createTransactionalEmail: async () => {
        throw new Error("must not create a duplicate");
      },
    });
    const warnings: string[] = [];

    const resolved = await resolveTransactionalCopy({
      client,
      copyName: "Welcome [vi-VN]",
      pushWarning: (message) => warnings.push(message),
    });

    expect(resolved.copyId).toBe("new");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("found 2 copies");
  });

  it("creates when no copy exists", async () => {
    const client = fakeClient({
      listTransactionalEmails: async () => [],
      createTransactionalEmail: async () => ({
        ...transactionalItem("t9", "Welcome [zh-CN]"),
        draftEmailMessageContentRevisionId: "rev-0",
      }),
    });

    const resolved = await resolveTransactionalCopy({
      client,
      copyName: "Welcome [zh-CN]",
      pushWarning: () => {},
    });

    expect(resolved).toEqual({
      copyId: "t9",
      draftEmailMessageId: "draft-t9",
      expectedRevisionId: "rev-0",
    });
  });
});

describe("resolveCampaignCopy", () => {
  it("uses the stored campaign when it loads", async () => {
    const client = fakeClient({
      getCampaign: async () => campaignItem("c1", "Launch [vi-VN]"),
      getEmailMessage: async () => emailMessage("message-c1"),
    });

    const resolved = await resolveCampaignCopy({
      client,
      storedCopyId: "c1",
      copyName: "Launch [vi-VN]",
      pushWarning: () => {},
    });

    expect(resolved).toEqual({
      copyId: "c1",
      emailMessageId: "message-c1",
      expectedRevisionId: "rev-1",
    });
  });

  it("adopts a same-named campaign when the stored id was deleted", async () => {
    const createCampaign = vi.fn(async () => {
      throw new Error("must not create a duplicate");
    });
    const client = fakeClient({
      getCampaign: async (id: string) => {
        if (id === "stale") {
          throw notFound("404 - Campaign not found");
        }
        return campaignItem(id, "Launch [vi-VN]");
      },
      getEmailMessage: async () => emailMessage("message-c2", "rev-2"),
      listCampaigns: async () => [campaignItem("c2", "Launch [vi-VN]")],
      createCampaign,
    });

    const resolved = await resolveCampaignCopy({
      client,
      storedCopyId: "stale",
      copyName: "Launch [vi-VN]",
      pushWarning: () => {},
    });

    expect(resolved.copyId).toBe("c2");
    expect(createCampaign).not.toHaveBeenCalled();
  });

  it("fails loudly when the named campaign lost its email content", async () => {
    const client = fakeClient({
      listCampaigns: async () => [campaignItem("shell", "Launch [vi-VN]")],
      getCampaign: async () => campaignItem("shell", "Launch [vi-VN]"),
      getEmailMessage: async () => {
        throw notFound("404 - Email message not found");
      },
      createCampaign: async () => {
        throw new Error("must not stack another duplicate");
      },
    });
    const warnings: string[] = [];

    await expect(
      resolveCampaignCopy({
        client,
        copyName: "Launch [vi-VN]",
        pushWarning: (message) => warnings.push(message),
      }),
    ).rejects.toThrow("loops_copy_message_missing");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("delete it in the Loops dashboard");
  });
});
