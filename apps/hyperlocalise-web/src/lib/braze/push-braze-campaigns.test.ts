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

import {
  isBrazeCampaignRemoteNewer,
  mergeBrazeCampaignTranslationMap,
  shouldSkipBrazeCampaignLocalePush,
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
});
