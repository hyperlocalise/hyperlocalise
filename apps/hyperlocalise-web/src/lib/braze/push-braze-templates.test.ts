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
  });
});
