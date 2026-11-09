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
  isMailchimpRemoteCopyNewer,
  mailchimpCampaignCanRecreate,
  readMailchimpCopyUpdatedAt,
  rememberMailchimpCopy,
  shouldSkipMailchimpRemoteNewerCopy,
  shouldSkipUnchangedMailchimpPush,
} from "./existing-translation-policy";

describe("isMailchimpRemoteCopyNewer", () => {
  it("treats missing timestamps as newer", () => {
    const pushedAt = new Date("2026-10-01T00:00:00.000Z");
    // Campaigns only expose create_time, so push treats their edit time as missing.
    expect(isMailchimpRemoteCopyNewer({ lastPushedAt: pushedAt, copyUpdatedAt: null })).toBe(true);
    expect(
      isMailchimpRemoteCopyNewer({
        lastPushedAt: null,
        copyUpdatedAt: "2026-10-02T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("compares remote edit time against last push", () => {
    const pushedAt = new Date("2026-10-01T00:00:00.000Z");
    expect(
      isMailchimpRemoteCopyNewer({
        lastPushedAt: pushedAt,
        copyUpdatedAt: "2026-10-02T00:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      isMailchimpRemoteCopyNewer({
        lastPushedAt: pushedAt,
        copyUpdatedAt: "2026-10-01T00:01:00.000Z",
      }),
    ).toBe(false);
  });
});

describe("rememberMailchimpCopy", () => {
  it("keeps earlier locale copy ids when later locales persist in the same run", () => {
    const mapping = {
      localeCopyIds: {} as Record<string, string>,
      localeCopyNames: {} as Record<string, string>,
      lastPushContentHash: {} as Record<string, string>,
      lastPushedAt: null as Date | null,
    };

    rememberMailchimpCopy(mapping, "fr-FR", "tmpl-fr", "Welcome_fr-FR", "hash-fr");
    rememberMailchimpCopy(mapping, "de-DE", "tmpl-de", "Welcome_de-DE", "hash-de");

    expect(mapping.localeCopyIds).toEqual({ "fr-FR": "tmpl-fr", "de-DE": "tmpl-de" });
    expect(mapping.localeCopyNames).toEqual({
      "fr-FR": "Welcome_fr-FR",
      "de-DE": "Welcome_de-DE",
    });
    expect(mapping.lastPushContentHash).toEqual({ "fr-FR": "hash-fr", "de-DE": "hash-de" });
    expect(mapping.lastPushedAt).toBeInstanceOf(Date);
  });
});

describe("shouldSkipUnchangedMailchimpPush", () => {
  it("skips only when a previous hash exists and matches", () => {
    expect(shouldSkipUnchangedMailchimpPush("abc", "abc")).toBe(true);
    expect(shouldSkipUnchangedMailchimpPush("abc", "def")).toBe(false);
    expect(shouldSkipUnchangedMailchimpPush(undefined, "abc")).toBe(false);
    expect(shouldSkipUnchangedMailchimpPush("", "abc")).toBe(false);
  });
});

describe("shouldSkipMailchimpRemoteNewerCopy", () => {
  const pushedAt = new Date("2026-10-01T00:00:00.000Z");

  it("never skips a first create or an overwrite push", () => {
    expect(
      shouldSkipMailchimpRemoteNewerCopy({
        hasCopy: false,
        overwriteWhenRemoteNewer: false,
        lastPushedAt: pushedAt,
        copyUpdatedAt: null,
      }),
    ).toBe(false);
    expect(
      shouldSkipMailchimpRemoteNewerCopy({
        hasCopy: true,
        overwriteWhenRemoteNewer: true,
        lastPushedAt: pushedAt,
        copyUpdatedAt: null,
      }),
    ).toBe(false);
  });

  it("skips an existing campaign copy when overwrite is off because campaigns have no edit time", () => {
    expect(
      shouldSkipMailchimpRemoteNewerCopy({
        hasCopy: true,
        overwriteWhenRemoteNewer: false,
        lastPushedAt: pushedAt,
        copyUpdatedAt: null,
      }),
    ).toBe(true);
  });

  it("skips a template copy only when the remote timestamp is newer than the last push", () => {
    expect(
      shouldSkipMailchimpRemoteNewerCopy({
        hasCopy: true,
        overwriteWhenRemoteNewer: false,
        lastPushedAt: pushedAt,
        copyUpdatedAt: "2026-10-02T00:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      shouldSkipMailchimpRemoteNewerCopy({
        hasCopy: true,
        overwriteWhenRemoteNewer: false,
        lastPushedAt: pushedAt,
        copyUpdatedAt: "2026-10-01T00:01:00.000Z",
      }),
    ).toBe(false);
  });
});

describe("mailchimpCampaignCanRecreate", () => {
  it("requires both audience list and reply-to", () => {
    expect(mailchimpCampaignCanRecreate(null)).toBe(false);
    expect(mailchimpCampaignCanRecreate({ listId: "list-1", replyTo: "" })).toBe(false);
    expect(mailchimpCampaignCanRecreate({ listId: "", replyTo: "hi@example.com" })).toBe(false);
    expect(mailchimpCampaignCanRecreate({ listId: "list-1", replyTo: "hi@example.com" })).toBe(
      true,
    );
  });
});

describe("readMailchimpCopyUpdatedAt", () => {
  it("does not read campaign timestamps because create_time is not an edit signal", async () => {
    const getTemplate = async () => {
      throw new Error("campaigns must not load template timestamps");
    };
    await expect(
      readMailchimpCopyUpdatedAt({
        client: { getTemplate },
        resourceKind: "campaign",
        copyId: "camp-1",
      }),
    ).resolves.toBeNull();
  });

  it("prefers template date_edited, then edited_on, then created timestamps", async () => {
    await expect(
      readMailchimpCopyUpdatedAt({
        client: {
          getTemplate: async () => ({
            date_edited: "2026-10-04T00:00:00.000Z",
            edited_on: "2026-10-03T00:00:00.000Z",
            date_created: "2026-10-02T00:00:00.000Z",
            created_on: "2026-10-01T00:00:00.000Z",
          }),
        },
        resourceKind: "template",
        copyId: "tmpl-1",
      }),
    ).resolves.toBe("2026-10-04T00:00:00.000Z");
    await expect(
      readMailchimpCopyUpdatedAt({
        client: {
          getTemplate: async () => ({
            date_edited: "  ",
            edited_on: "2026-10-03T00:00:00.000Z",
          }),
        },
        resourceKind: "template",
        copyId: "tmpl-1",
      }),
    ).resolves.toBe("2026-10-03T00:00:00.000Z");
    await expect(
      readMailchimpCopyUpdatedAt({
        client: { getTemplate: async () => ({ date_created: "2026-10-02T00:00:00.000Z" }) },
        resourceKind: "template",
        copyId: "tmpl-1",
      }),
    ).resolves.toBe("2026-10-02T00:00:00.000Z");
    await expect(
      readMailchimpCopyUpdatedAt({
        client: { getTemplate: async () => ({ created_on: "2026-10-01T00:00:00.000Z" }) },
        resourceKind: "template",
        copyId: "tmpl-1",
      }),
    ).resolves.toBe("2026-10-01T00:00:00.000Z");
    await expect(
      readMailchimpCopyUpdatedAt({
        client: { getTemplate: async () => ({}) },
        resourceKind: "template",
        copyId: "tmpl-1",
      }),
    ).resolves.toBeNull();
  });
});
