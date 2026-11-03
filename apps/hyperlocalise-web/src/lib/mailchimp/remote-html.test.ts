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

import { htmlFromTemplateSections, resolveCampaignHtml, resolveTemplateHtml } from "./remote-html";
import type { MailchimpClient } from "./client";

describe("resolveCampaignHtml", () => {
  it("prefers html over archive_html", () => {
    expect(
      resolveCampaignHtml({
        html: "<p>primary</p>",
        archive_html: "<p>archive</p>",
      }),
    ).toBe("<p>primary</p>");
  });

  it("falls back to archive_html", () => {
    expect(resolveCampaignHtml({ archive_html: "<p>archive</p>" })).toBe("<p>archive</p>");
  });
});

describe("htmlFromTemplateSections", () => {
  it("collects nested section html", () => {
    expect(
      htmlFromTemplateSections({
        body: { html: "<p>Hello</p>" },
        footer: "<span>Foot</span>",
      }),
    ).toBe("<p>Hello</p>\n<span>Foot</span>");
  });

  it("collects entity-encoded section defaults", () => {
    expect(
      htmlFromTemplateSections({
        body: "&lt;p&gt;Hello&lt;/p&gt;",
      }),
    ).toBe("&lt;p&gt;Hello&lt;/p&gt;");
  });

  it("reads html from section content fields", () => {
    expect(
      htmlFromTemplateSections({
        main: { content: "<table><tr><td>Cell</td></tr></table>" },
      }),
    ).toBe("<table><tr><td>Cell</td></tr></table>");
  });
});

describe("resolveTemplateHtml", () => {
  it("loads html from default-content when template metadata omits it", async () => {
    const client = {
      getTemplate: async () => ({
        id: 10000144,
        name: "Code my own",
        content_type: "html" as const,
      }),
      getTemplateDefaultContent: async () => ({
        html: "<html><body><p>Newsletter</p></body></html>",
      }),
    } as unknown as MailchimpClient;

    await expect(resolveTemplateHtml(client, "10000144")).resolves.toBe(
      "<html><body><p>Newsletter</p></body></html>",
    );
  });

  it("uses a campaign that already applies the template", async () => {
    const client = {
      getTemplate: async () => ({ id: 10000144, name: "Code my own" }),
      getTemplateDefaultContent: async () => ({ sections: {} }),
      getCampaignContent: async () => ({ html: "<p>From campaign</p>" }),
    } as unknown as MailchimpClient;

    await expect(
      resolveTemplateHtml(client, "10000144", undefined, [
        {
          id: "camp-1",
          type: "regular",
          settings: { title: "Sale", template_id: 10000144 },
        },
      ]),
    ).resolves.toBe("<p>From campaign</p>");
  });

  it("renders the template onto a draft campaign when Mailchimp stores no HTML", async () => {
    const deleted: string[] = [];
    const client = {
      getTemplate: async () => ({ id: 10000144, name: "Code my own" }),
      getTemplateDefaultContent: async () => ({ sections: {} }),
      listAudiences: async () => [
        { id: "list-1", campaign_defaults: { from_email: "hi@example.com", from_name: "Hi" } },
      ],
      getAudience: async () => ({
        id: "list-1",
        campaign_defaults: { from_email: "hi@example.com", from_name: "Hi" },
      }),
      createCampaign: async () => ({ id: "draft-1", type: "regular", settings: {} }),
      applyCampaignTemplate: async () => undefined,
      getCampaignContent: async () => ({ html: "<p>Rendered</p>" }),
      deleteCampaign: async (id: string) => {
        deleted.push(id);
      },
    } as unknown as MailchimpClient;

    await expect(resolveTemplateHtml(client, "10000144")).resolves.toBe("<p>Rendered</p>");
    expect(deleted).toEqual(["draft-1"]);
  });
});
