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
  BRAZE_REMOTE_NEWER_SLACK_MS,
  countMappedBrazeTargetLocales,
  isRemoteNewer,
  lastPushedAtForBrazeLocale,
  mergeBrazeLastPushedAtByLocale,
  shouldSkipBrazeLocalePush,
  shouldSkipUnchangedBrazePush,
} from "./push-braze-templates";

describe("push braze helpers", () => {
  it("skips unchanged hashes regardless of overwriteWhenRemoteNewer", () => {
    expect(shouldSkipUnchangedBrazePush("abc", "abc")).toBe(true);
    expect(shouldSkipUnchangedBrazePush("abc", "def")).toBe(false);
    expect(shouldSkipUnchangedBrazePush(undefined, "abc")).toBe(false);
  });

  it("counts mapped target locales that have a Braze suffix", () => {
    expect(
      countMappedBrazeTargetLocales({
        jobTargetLocales: ["fr-FR", "de-DE", ""],
        brazeSuffixes: ["fr-FR", "de-DE", "ja"],
      }),
    ).toBe(2);
  });

  it("compares remote edits against the per-locale last push", () => {
    const mapping = {
      lastPushedAt: new Date("2026-10-11T13:00:00.000Z"),
      extra: {
        lastPushedAtByLocale: {
          "fr-FR": "2026-10-11T11:00:00.000Z",
          "de-DE": "2026-10-11T13:00:00.000Z",
        },
      },
    };
    expect(lastPushedAtForBrazeLocale(mapping, "fr-FR")?.toISOString()).toBe(
      "2026-10-11T11:00:00.000Z",
    );
    expect(lastPushedAtForBrazeLocale(mapping, "ja-JP")?.toISOString()).toBe(
      "2026-10-11T13:00:00.000Z",
    );
  });

  it("overwrites an unchanged local copy when remote drift is newer and overwrite is on", () => {
    const lastPushedAt = new Date("2026-10-11T12:00:00.000Z");
    const drifted = new Date(
      lastPushedAt.getTime() + BRAZE_REMOTE_NEWER_SLACK_MS + 1,
    ).toISOString();
    expect(
      shouldSkipBrazeLocalePush({
        lastHash: "abc",
        contentHash: "abc",
        overwriteWhenRemoteNewer: true,
        remoteUpdatedAt: drifted,
        lastPushedAt,
      }),
    ).toBe(false);
    expect(
      shouldSkipBrazeLocalePush({
        lastHash: "abc",
        contentHash: "abc",
        overwriteWhenRemoteNewer: true,
        remoteUpdatedAt: "2026-10-11T11:59:00.000Z",
        lastPushedAt,
      }),
    ).toBe(true);
    expect(
      shouldSkipBrazeLocalePush({
        lastHash: "abc",
        contentHash: "abc",
        overwriteWhenRemoteNewer: false,
        remoteUpdatedAt: drifted,
        lastPushedAt,
      }),
    ).toBe(true);
  });

  it("treats the remote as newer only after slack", () => {
    const lastPushedAt = new Date("2026-10-11T12:00:00.000Z");
    expect(isRemoteNewer("2026-10-11T12:00:03.000Z", lastPushedAt)).toBe(false);
    expect(
      isRemoteNewer(
        new Date(lastPushedAt.getTime() + BRAZE_REMOTE_NEWER_SLACK_MS + 1).toISOString(),
        lastPushedAt,
      ),
    ).toBe(true);
    expect(isRemoteNewer("2026-10-11T11:59:00.000Z", lastPushedAt)).toBe(false);
    expect(isRemoteNewer("2026-10-11T12:00:00.000Z", null)).toBe(true);
    expect(
      shouldSkipBrazeLocalePush({
        lastHash: undefined,
        contentHash: "new",
        overwriteWhenRemoteNewer: false,
        remoteUpdatedAt: "2026-10-11T12:00:00.000Z",
        lastPushedAt: null,
      }),
    ).toBe(true);
    expect(
      mergeBrazeLastPushedAtByLocale(
        { lastPushedAtByLocale: { "fr-FR": "2026-10-11T10:00:00.000Z" } },
        { "fr-FR": "2026-10-11T09:00:00.000Z", "de-DE": "2026-10-11T11:00:00.000Z" },
      ),
    ).toEqual({
      "fr-FR": "2026-10-11T10:00:00.000Z",
      "de-DE": "2026-10-11T11:00:00.000Z",
    });
  });
});
