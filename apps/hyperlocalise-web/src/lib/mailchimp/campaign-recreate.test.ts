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

import {
  resolveCampaignRecreateFields,
  resolveMailchimpCampaignRecreateForCopy,
} from "./campaign-recreate";
import type { MailchimpClient } from "./client";

describe("resolveCampaignRecreateFields", () => {
  it("uses audience campaign defaults when the campaign omits reply-to", () => {
    const resolved = resolveCampaignRecreateFields({
      campaign: {
        id: "abc",
        type: "regular",
        settings: { title: "Sale" },
        recipients: { list_id: "list-1" },
      },
      audienceDefaults: {
        from_email: "hello@example.com",
        from_name: "Hyperlocalise",
      },
    });
    expect(resolved).toEqual({
      listId: "list-1",
      replyTo: "hello@example.com",
      fromEmail: "hello@example.com",
      fromName: "Hyperlocalise",
    });
  });

  it("returns null when list or reply-to cannot be resolved", () => {
    expect(
      resolveCampaignRecreateFields({
        campaign: { id: "abc", type: "regular", settings: {} },
      }),
    ).toBeNull();
  });
});

describe("resolveMailchimpCampaignRecreateForCopy", () => {
  it("uses the first account audience when the source campaign has no list", async () => {
    const client = {
      listAudiences: async () => [
        { id: "list-9", campaign_defaults: { from_email: "team@example.com", from_name: "Team" } },
      ],
      getAudience: async () => ({
        id: "list-9",
        campaign_defaults: { from_email: "team@example.com", from_name: "Team" },
      }),
    } as unknown as MailchimpClient;

    await expect(
      resolveMailchimpCampaignRecreateForCopy(client, {
        id: "camp-1",
        type: "regular",
        settings: { title: "Bright Up Your Space" },
      }),
    ).resolves.toEqual({
      listId: "list-9",
      replyTo: "team@example.com",
      fromEmail: "team@example.com",
      fromName: "Team",
    });
  });
});
