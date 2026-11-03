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

import type { MailchimpClient } from "./client";
import { listMailchimpLibrary } from "./list-library";

function libraryClient(input: {
  campaigns?: Awaited<ReturnType<MailchimpClient["listRegularCampaigns"]>>;
  templates?: Awaited<ReturnType<MailchimpClient["listUserTemplates"]>>;
}): MailchimpClient {
  return {
    listRegularCampaigns: async () => input.campaigns ?? [],
    listUserTemplates: async () => input.templates ?? [],
  } as MailchimpClient;
}

describe("listMailchimpLibrary", () => {
  it("keeps source campaigns and templates and drops locale copies", async () => {
    const library = await listMailchimpLibrary(
      libraryClient({
        campaigns: [
          {
            id: "campaign-1",
            type: "regular",
            settings: { title: "Welcome", subject_line: "Hello" },
          },
          {
            id: "campaign-2",
            type: "regular",
            settings: { title: "Welcome [fr-FR]" },
          },
          {
            id: "campaign-3",
            type: "regular",
            settings: { subject_line: "Untitled subject" },
          },
          {
            id: "  ",
            type: "regular",
            settings: { title: "Missing id" },
          },
        ],
        templates: [
          {
            id: 11,
            name: "Promo",
            type: "user",
            content_type: "html",
          },
          {
            id: 12,
            name: "Promo [vi-VN]",
            type: "user",
            content_type: "html",
          },
          {
            id: 13,
            name: "  ",
            type: "user",
            content_type: "html",
          },
          {
            id: 14,
            name: "The Care Guide",
            type: "user",
            content_type: "template",
            drag_and_drop: true,
          },
          {
            id: 15,
            name: "Care [ja-JP]",
            type: "user",
            content_type: "template",
            drag_and_drop: true,
          },
        ],
      }),
    );

    expect(library.campaigns).toEqual([
      { id: "campaign-1", name: "Welcome" },
      { id: "campaign-3", name: "Untitled subject" },
    ]);
    expect(library.templates).toEqual([
      { id: "11", name: "Promo" },
      { id: "13", name: "13" },
    ]);
    expect(library.unsupportedTemplates).toEqual([
      {
        id: "14",
        name: "The Care Guide",
        reason: "drag-and-drop (import campaigns or HTML templates instead)",
      },
    ]);
    expect(library.warnings).toEqual([
      "The Care Guide is drag-and-drop — import the campaign instead.",
    ]);
  });
});
