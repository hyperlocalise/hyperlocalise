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
  isExactSlackChannelMatch,
  mergeVisibleSlackChannels,
  normalizeSlackChannelQuery,
  parseSlackConversationId,
  slackChannelMatchesQuery,
  toCanonicalSlackChannelId,
} from "./channel-query";

const releaseNotes = { id: "slack:C01234567", name: "release-notes" };
const general = { id: "slack:C07654321", name: "general" };

describe("channel-query", () => {
  it("normalizes names and parses Slack conversation ids", () => {
    expect(toCanonicalSlackChannelId("C123")).toBe("slack:C123");
    expect(normalizeSlackChannelQuery("#L10N")).toBe("l10n");
    expect(parseSlackConversationId("slack:C01234567")).toBe("C01234567");
    expect(parseSlackConversationId("https://acme.slack.com/archives/C01234567/p1")).toBe(
      "C01234567",
    );
    expect(parseSlackConversationId("<#C01234567|release-notes>")).toBe("C01234567");
    expect(parseSlackConversationId("release-notes")).toBeNull();
  });

  it("matches typed names against Slack slugs inside the selector", () => {
    expect(slackChannelMatchesQuery(releaseNotes, "")).toBe(true);
    expect(slackChannelMatchesQuery(releaseNotes, "rel")).toBe(true);
    expect(slackChannelMatchesQuery(releaseNotes, "Release Notes")).toBe(true);
    expect(slackChannelMatchesQuery(releaseNotes, "releasenotes")).toBe(true);
    expect(slackChannelMatchesQuery(releaseNotes, "C01234567")).toBe(true);
    expect(slackChannelMatchesQuery(releaseNotes, "general")).toBe(false);
    expect(isExactSlackChannelMatch(releaseNotes, "release-notes")).toBe(true);
    expect(isExactSlackChannelMatch(releaseNotes, "rel")).toBe(false);
  });

  it("keeps the loaded list and merges extra remote matches", () => {
    const visible = mergeVisibleSlackChannels(
      [general, releaseNotes],
      [{ id: "slack:C99999999", name: "release-notes-eu" }],
      "release notes",
    );

    expect(visible.map((channel) => channel.name)).toEqual(["release-notes", "release-notes-eu"]);
  });
});
