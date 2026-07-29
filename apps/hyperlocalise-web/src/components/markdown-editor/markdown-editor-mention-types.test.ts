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
  extractMentionIdsFromMarkdown,
  mentionHrefForIssue,
  mentionHrefForUser,
  parseMentionHref,
} from "./markdown-editor-mention-types";

describe("markdown mention helpers", () => {
  it("builds and parses mention hrefs", () => {
    expect(mentionHrefForUser("11111111-1111-4111-8111-111111111111")).toBe(
      "mention:user:11111111-1111-4111-8111-111111111111",
    );
    expect(mentionHrefForIssue("22222222-2222-4222-8222-222222222222", "project_website")).toBe(
      "mention:issue:22222222-2222-4222-8222-222222222222:project_website",
    );
    expect(parseMentionHref("mention:user:11111111-1111-4111-8111-111111111111")).toEqual({
      kind: "user",
      id: "11111111-1111-4111-8111-111111111111",
    });
    expect(
      parseMentionHref("mention:issue:22222222-2222-4222-8222-222222222222:project_website"),
    ).toEqual({
      kind: "issue",
      id: "22222222-2222-4222-8222-222222222222",
      projectId: "project_website",
    });
  });

  it("rejects issue mention hrefs without project id", () => {
    expect(parseMentionHref("mention:issue:22222222-2222-4222-8222-222222222222")).toBeNull();
  });

  it("rejects issue mention hrefs with malformed project id encoding", () => {
    expect(
      parseMentionHref("mention:issue:22222222-2222-4222-8222-222222222222:%"),
    ).toBeNull();
  });

  it("extracts user and issue ids from markdown", () => {
    const markdown =
      "Hello [@Ada](mention:user:11111111-1111-4111-8111-111111111111) see [@HL-1](mention:issue:22222222-2222-4222-8222-222222222222:project_website)";
    expect(extractMentionIdsFromMarkdown(markdown)).toEqual({
      mentionedUserIds: ["11111111-1111-4111-8111-111111111111"],
      mentionedIssueIds: ["22222222-2222-4222-8222-222222222222"],
    });
  });
});
