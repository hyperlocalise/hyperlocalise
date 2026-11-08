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

import {
  loadFirstAudienceDefaults,
  loadMailchimpAudienceDefaultsForCampaign,
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
    expect(
      resolveCampaignRecreateFields({
        campaign: {
          id: "abc",
          type: "regular",
          settings: { reply_to: "  " },
          recipients: { list_id: "  " },
        },
      }),
    ).toBeNull();
  });

  it("uses settings.from_email as reply-to before audience defaults", () => {
    expect(
      resolveCampaignRecreateFields({
        campaign: {
          id: "abc",
          type: "regular",
          settings: { from_email: "copy@example.com", from_name: "Copy" },
          recipients: { list_id: "list-1" },
        },
        audienceDefaults: { from_email: "audience@example.com", from_name: "Audience" },
      }),
    ).toEqual({
      listId: "list-1",
      replyTo: "copy@example.com",
      fromEmail: "copy@example.com",
      fromName: "Copy",
    });
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

  it("does not fetch the audience when the campaign already has reply-to and from-name", async () => {
    const getAudience = vi.fn();
    const client = { getAudience, listAudiences: vi.fn() } as unknown as MailchimpClient;

    await expect(
      resolveMailchimpCampaignRecreateForCopy(client, {
        id: "camp-1",
        type: "regular",
        settings: { reply_to: "hello@example.com", from_name: "Hyperlocalise" },
        recipients: { list_id: "list-1" },
      }),
    ).resolves.toEqual({
      listId: "list-1",
      replyTo: "hello@example.com",
      fromEmail: "hello@example.com",
      fromName: "Hyperlocalise",
    });
    expect(getAudience).not.toHaveBeenCalled();
  });

  it("uses the campaign list's audience defaults when reply-to is missing", async () => {
    const client = {
      getAudience: async (id: string) => {
        expect(id).toBe("list-3");
        return {
          id: "list-3",
          campaign_defaults: { from_email: "list@example.com", from_name: "List" },
        };
      },
      listAudiences: vi.fn(async () => {
        throw new Error("should not list audiences");
      }),
    } as unknown as MailchimpClient;

    await expect(
      resolveMailchimpCampaignRecreateForCopy(client, {
        id: "camp-2",
        type: "regular",
        settings: { title: "Sale" },
        recipients: { list_id: "list-3" },
      }),
    ).resolves.toEqual({
      listId: "list-3",
      replyTo: "list@example.com",
      fromEmail: "list@example.com",
      fromName: "List",
    });
  });

  it("falls back to the first audience when the campaign list lookup fails", async () => {
    const client = {
      getAudience: async (id: string) => {
        if (id === "list-missing") {
          throw new Error("404");
        }
        return { id, campaign_defaults: { from_email: "team@example.com", from_name: "Team" } };
      },
      listAudiences: async () => [
        { id: "list-9", campaign_defaults: { from_email: "team@example.com" } },
      ],
    } as unknown as MailchimpClient;

    await expect(
      resolveMailchimpCampaignRecreateForCopy(client, {
        id: "camp-3",
        type: "regular",
        settings: {},
        recipients: { list_id: "list-missing" },
      }),
    ).resolves.toEqual({
      listId: "list-missing",
      replyTo: "team@example.com",
      fromEmail: "team@example.com",
      fromName: "Team",
    });
  });

  it("returns null when no audience can supply reply-to", async () => {
    const client = {
      getAudience: async () => {
        throw new Error("down");
      },
      listAudiences: async () => [{ id: "list-empty", campaign_defaults: {} }],
    } as unknown as MailchimpClient;

    await expect(
      resolveMailchimpCampaignRecreateForCopy(client, {
        id: "camp-4",
        type: "regular",
        settings: {},
      }),
    ).resolves.toBeNull();
  });
});

describe("loadMailchimpAudienceDefaultsForCampaign", () => {
  it("skips the audience fetch when reply-to and from-name are already set", async () => {
    const getAudience = vi.fn();
    const defaults = await loadMailchimpAudienceDefaultsForCampaign(
      { getAudience } as unknown as MailchimpClient,
      {
        id: "camp-1",
        type: "regular",
        settings: { reply_to: "hello@example.com", from_name: "Hyperlocalise" },
        recipients: { list_id: "list-1" },
      },
    );
    expect(defaults).toBeNull();
    expect(getAudience).not.toHaveBeenCalled();
  });

  it("returns null when the campaign has no list or the audience lookup fails", async () => {
    await expect(
      loadMailchimpAudienceDefaultsForCampaign(
        { getAudience: vi.fn() } as unknown as MailchimpClient,
        {
          id: "camp-1",
          type: "regular",
          settings: {},
        },
      ),
    ).resolves.toBeNull();

    await expect(
      loadMailchimpAudienceDefaultsForCampaign(
        {
          getAudience: async () => {
            throw new Error("404");
          },
        } as unknown as MailchimpClient,
        {
          id: "camp-1",
          type: "regular",
          settings: {},
          recipients: { list_id: "list-1" },
        },
      ),
    ).resolves.toBeNull();
  });
});

describe("loadFirstAudienceDefaults", () => {
  it("returns null when the account has no audiences", async () => {
    await expect(
      loadFirstAudienceDefaults({
        listAudiences: async () => [],
        getAudience: vi.fn(),
      } as unknown as MailchimpClient),
    ).resolves.toBeNull();

    await expect(
      loadFirstAudienceDefaults({
        listAudiences: async () => {
          throw new Error("down");
        },
        getAudience: vi.fn(),
      } as unknown as MailchimpClient),
    ).resolves.toBeNull();
  });

  it("uses the list summary when the first audience detail lookup fails", async () => {
    await expect(
      loadFirstAudienceDefaults({
        listAudiences: async () => [
          { id: "  ", campaign_defaults: { from_email: "skip@example.com" } },
          {
            id: "list-9",
            campaign_defaults: { from_email: "team@example.com", from_name: "Team" },
          },
        ],
        getAudience: async () => {
          throw new Error("404");
        },
      } as unknown as MailchimpClient),
    ).resolves.toEqual({
      listId: "list-9",
      defaults: { from_email: "team@example.com", from_name: "Team" },
    });
  });
});
