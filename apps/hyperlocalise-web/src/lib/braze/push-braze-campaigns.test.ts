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

import { hashBrazeTranslationMap } from "./translation-map";

import { BrazeApiError, type BrazeLocaleTranslation } from "./client";
import {
  isBrazeCampaignRemoteNewer,
  loadBrazeCampaignRemoteTranslation,
  mergeBrazeCampaignTranslationMap,
  shouldSkipBrazeCampaignLocalePush,
  shouldTreatBrazeRemoteTranslationAsEmpty,
} from "./push-braze-campaigns";

describe("braze campaign push helpers", () => {
  it("merges source, then remote, then approved", () => {
    expect(
      mergeBrazeCampaignTranslationMap({
        source: { a: "source-a", b: "source-b", c: "source-c" },
        remote: { b: "remote-b", c: "remote-c" },
        approved: { c: "approved-c" },
      }),
    ).toEqual({
      a: "source-a",
      b: "remote-b",
      c: "approved-c",
    });
  });

  it("treats a newer timestamp or a changed remote hash as remote newer", () => {
    const lastPushedAt = new Date("2026-10-11T12:00:00.000Z");
    expect(
      isBrazeCampaignRemoteNewer({
        remoteUpdatedAt: "2026-10-11T13:00:00.000Z",
        lastPushedAt,
      }),
    ).toBe(true);
    expect(
      isBrazeCampaignRemoteNewer({
        lastPushedAt,
        lastPushHash: "abc",
        remoteHash: "def",
      }),
    ).toBe(true);
    expect(
      isBrazeCampaignRemoteNewer({
        lastPushedAt,
        lastPushHash: "abc",
        remoteHash: "abc",
      }),
    ).toBe(false);
    expect(
      isBrazeCampaignRemoteNewer({
        lastPushedAt,
        lastPushHash: "abc",
      }),
    ).toBe(false);
  });

  it("skips when remote changed and overwrite is off", () => {
    const remote = hashBrazeTranslationMap({ a: "remote" });
    const outgoing = hashBrazeTranslationMap({ a: "approved" });
    expect(
      shouldSkipBrazeCampaignLocalePush({
        lastHash: "prev",
        contentHash: outgoing,
        overwriteWhenRemoteNewer: false,
        lastPushedAt: new Date("2026-10-11T12:00:00.000Z"),
        lastPushHash: "prev",
        remoteHash: remote,
      }),
    ).toBe(true);
    expect(
      shouldSkipBrazeCampaignLocalePush({
        lastHash: "prev",
        contentHash: outgoing,
        overwriteWhenRemoteNewer: true,
        lastPushedAt: new Date("2026-10-11T12:00:00.000Z"),
        lastPushHash: "prev",
        remoteHash: remote,
      }),
    ).toBe(false);
  });

  it("pushes a changed map unless overwrite is off and remote is newer", () => {
    expect(
      shouldSkipBrazeCampaignLocalePush({
        lastHash: "prev",
        contentHash: "next",
        overwriteWhenRemoteNewer: false,
        lastPushedAt: new Date("2026-10-11T12:00:00.000Z"),
        lastPushHash: "prev",
        remoteHash: "prev",
      }),
    ).toBe(false);
  });

  it("skips an unchanged map unless overwrite is on and remote drifted", () => {
    expect(
      shouldSkipBrazeCampaignLocalePush({
        lastHash: "same",
        contentHash: "same",
        overwriteWhenRemoteNewer: false,
        lastPushedAt: new Date("2026-10-11T12:00:00.000Z"),
        lastPushHash: "same",
        remoteHash: "same",
      }),
    ).toBe(true);
    expect(
      shouldSkipBrazeCampaignLocalePush({
        lastHash: "same",
        contentHash: "same",
        overwriteWhenRemoteNewer: true,
        lastPushedAt: new Date("2026-10-11T12:00:00.000Z"),
        lastPushHash: "same",
        remoteHash: "same",
      }),
    ).toBe(true);
    expect(
      shouldSkipBrazeCampaignLocalePush({
        lastHash: "same",
        contentHash: "same",
        overwriteWhenRemoteNewer: true,
        lastPushedAt: new Date("2026-10-11T12:00:00.000Z"),
        lastPushHash: "same",
        remoteHash: "drifted",
      }),
    ).toBe(false);
  });

  it("treats only missing locales as empty remote maps", () => {
    expect(
      shouldTreatBrazeRemoteTranslationAsEmpty(
        new BrazeApiError({
          message: "not found",
          status: 404,
        }),
      ),
    ).toBe(true);
    expect(
      shouldTreatBrazeRemoteTranslationAsEmpty(
        new BrazeApiError({
          message: "does not have multi-language",
          status: 400,
          code: "braze_no_multi_language",
        }),
      ),
    ).toBe(true);
    expect(
      shouldTreatBrazeRemoteTranslationAsEmpty(
        new BrazeApiError({
          message: "rate limited",
          status: 429,
        }),
      ),
    ).toBe(false);
  });
});

function localeTranslation(
  localeId: string,
  translationMap: Record<string, string>,
  updatedAt?: string,
): BrazeLocaleTranslation {
  return {
    translation_map: translationMap,
    locale: { uuid: localeId },
    updatedAt,
  };
}

describe("loadBrazeCampaignRemoteTranslation", () => {
  const localeId = "locale-fr";

  it("uses the post-launch draft map when it has keys", async () => {
    const loaded: boolean[] = [];
    await expect(
      loadBrazeCampaignRemoteTranslation({
        localeId,
        load: async (postLaunchDraftVersion) => {
          loaded.push(postLaunchDraftVersion);
          return [
            localeTranslation(localeId, { headline: "draft-fr" }, "2026-10-12T12:00:00.000Z"),
          ];
        },
      }),
    ).resolves.toEqual({
      translationMap: { headline: "draft-fr" },
      updatedAt: "2026-10-12T12:00:00.000Z",
    });
    expect(loaded).toEqual([true]);
  });

  it("falls back to the live map when the draft GET 404s", async () => {
    const loaded: boolean[] = [];
    await expect(
      loadBrazeCampaignRemoteTranslation({
        localeId,
        load: async (postLaunchDraftVersion) => {
          loaded.push(postLaunchDraftVersion);
          if (postLaunchDraftVersion) {
            throw new BrazeApiError({ message: "not found", status: 404 });
          }
          return [localeTranslation(localeId, { headline: "live-fr", extra: "keep-me" })];
        },
      }),
    ).resolves.toEqual({
      translationMap: { headline: "live-fr", extra: "keep-me" },
    });
    expect(loaded).toEqual([true, false]);
  });

  it("falls back to the live map when the draft locale map is empty", async () => {
    await expect(
      loadBrazeCampaignRemoteTranslation({
        localeId,
        load: async (postLaunchDraftVersion) =>
          postLaunchDraftVersion
            ? [localeTranslation(localeId, {})]
            : [localeTranslation(localeId, { headline: "live-fr" })],
      }),
    ).resolves.toEqual({
      translationMap: { headline: "live-fr" },
    });
  });

  it("returns an empty map when draft and live GETs are missing", async () => {
    await expect(
      loadBrazeCampaignRemoteTranslation({
        localeId,
        load: async () => {
          throw new BrazeApiError({ message: "not found", status: 404 });
        },
      }),
    ).resolves.toEqual({ translationMap: {} });
  });

  it("does not swallow non-empty remote failures", async () => {
    await expect(
      loadBrazeCampaignRemoteTranslation({
        localeId,
        load: async () => {
          throw new BrazeApiError({ message: "rate limited", status: 429 });
        },
      }),
    ).rejects.toMatchObject({ status: 429 });
  });
});
