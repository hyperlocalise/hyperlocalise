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
  createHubspotContentClientFromSdk,
  type HubspotApiRequestBody,
  type HubspotSdk,
} from "./client";
import { buildPageDocument, hubspotDocumentHasCopy, type HubspotJson } from "./document";

function jsonResponse(status: number, body: HubspotJson) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

type ApiCall = {
  method: string;
  path: string;
  body?: HubspotApiRequestBody;
  qs?: Record<string, string>;
};

function sdkWith(apiRequest: HubspotSdk["apiRequest"]): HubspotSdk {
  return {
    apiRequest,
    marketing: { emails: { marketingEmailsApi: {} }, forms: { formsApi: {} } },
    cms: { blogs: { blogPosts: {} }, pages: { landingPagesApi: {}, sitePagesApi: {} } },
  } as unknown as HubspotSdk;
}

describe("hubspot message templates", () => {
  it("lists, reads, creates, and updates templates through the SDK request client", async () => {
    const calls: ApiCall[] = [];
    const client = createHubspotContentClientFromSdk(
      sdkWith(async (opts) => {
        calls.push(opts);
        if (opts.method === "GET" && opts.path === "/automation/email-templates/2026-09") {
          return jsonResponse(200, {
            results: [
              { id: "42", name: "Welcome", subject: "Hi", body: "<p>Hi</p>", folderId: "9" },
            ],
          });
        }
        if (opts.method === "GET") {
          return jsonResponse(200, {
            id: 42,
            name: "Welcome",
            subject: "Hi",
            body: "<p>Hi</p>",
            folderId: "9",
          });
        }
        if (opts.method === "POST") {
          return jsonResponse(200, { id: "99", name: opts.body?.name ?? "" });
        }
        return jsonResponse(200, {});
      }),
    );

    const listed = await client.listMessageTemplates();
    expect(listed).toEqual([{ id: "42", name: "Welcome" }]);

    const record = await client.getMessageTemplate("42");
    expect(record).toEqual({
      id: "42",
      name: "Welcome",
      subject: "Hi",
      body: "<p>Hi</p>",
      folderId: "9",
    });

    const created = await client.createMessageTemplate({
      name: "Welcome [fr-FR]",
      subject: "Bonjour",
      body: "<p>Bonjour</p>",
      folderId: "9",
    });
    expect(created).toEqual({ id: "99" });
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({
      name: "Welcome [fr-FR]",
      subject: "Bonjour",
      body: "<p>Bonjour</p>",
      folderId: "9",
    });

    await client.updateMessageTemplate({
      id: "99",
      name: "Welcome [fr-FR]",
      subject: "Salut",
      body: "<p>Salut</p>",
    });
    expect(calls.find((call) => call.method === "PATCH")?.path).toBe(
      "/automation/email-templates/2026-09/99",
    );
  });

  it("creates a blog language variation before cloning a post into that language", async () => {
    const calls: ApiCall[] = [];
    let postVariations = 0;
    const blogs = {
      basicApi: {
        getById: async () => ({ id: "post-1", contentGroupId: "blog-1", language: "en" }),
      },
      multiLanguageApi: {
        createLangVariation: async () => {
          postVariations += 1;
          if (postVariations === 1) {
            throw new Error(
              'HTTP-Code: 400\nBody: {"message":"Blog does not have a variation for language zh-cn"}',
            );
          }
          return { id: "post-zh" };
        },
      },
    };
    const content = createHubspotContentClientFromSdk({
      ...sdkWith(async (opts) => {
        calls.push(opts);
        return jsonResponse(200, { id: "blog-zh", language: "zh-cn" });
      }),
      cms: {
        blogs: { blogPosts: blogs },
        pages: { landingPagesApi: {}, sitePagesApi: {} },
      },
    } as unknown as HubspotSdk);
    const created = await content.createBlogLanguageVariation({ id: "post-1", language: "zh-cn" });
    expect(created).toEqual({ id: "post-zh" });
    expect(postVariations).toBe(2);
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/cms/blog-settings/2026-09/settings/multi-language/create-language-variation",
        body: { id: "blog-1", language: "zh-cn", primaryLanguage: "en" },
      },
    ]);
  });

  it("reads draft module text when the published page is empty", async () => {
    const client = createHubspotContentClientFromSdk(
      sdkWith(async (opts) => {
        if (opts.path === "/cms/v3/pages/site-pages/home") {
          return jsonResponse(200, {
            id: "home",
            name: "Home",
            language: "en",
            widgets: {},
            layoutSections: {},
            widgetContainers: {},
          });
        }
        if (opts.path === "/cms/v3/pages/site-pages/home/draft") {
          return jsonResponse(200, {
            id: "home",
            name: "Home",
            widgets: {
              hero: {
                id: "hero",
                type: "module",
                body: {
                  html: { value: "<p>Welcome to the homepage with a lot of text.</p>" },
                },
              },
            },
            layoutSections: {
              dnd_area: {
                rows: [
                  {
                    "0": {
                      widgets: [{ body: { html: "<p>Section copy that the editor shows.</p>" } }],
                    },
                  },
                ],
              },
            },
          });
        }
        return jsonResponse(404, {});
      }),
    );
    const page = await client.getWebsitePage("home");
    const document = buildPageDocument(page);
    expect(hubspotDocumentHasCopy(document)).toBe(true);
    expect(JSON.stringify(document)).toContain("Welcome to the homepage");
    expect(JSON.stringify(document)).toContain("Section copy that the editor shows");
  });

  it("patches the page draft without dropping nested module fields", async () => {
    const calls: ApiCall[] = [];
    const layoutSections = {
      dnd_area: {
        rows: [
          {
            "0": {
              widgets: [{ body: { html: "<p>Section copy that the editor shows.</p>" } }],
            },
          },
        ],
      },
    };
    const client = createHubspotContentClientFromSdk(
      sdkWith(async (opts) => {
        calls.push({ method: opts.method, path: opts.path, body: opts.body });
        return jsonResponse(200, {});
      }),
    );
    await client.updateLandingPageDraft({
      id: "page-1",
      name: "Landing page [zh-CN]",
      language: "zh-cn",
      htmlTitle: "Landing",
      metaDescription: "",
      featuredImageAltText: "",
      widgets: {},
      layoutSections,
      widgetContainers: {},
    });
    expect(calls).toEqual([
      {
        method: "PATCH",
        path: "/cms/v3/pages/landing-pages/page-1/draft",
        body: {
          name: "Landing page [zh-CN]",
          language: "zh-cn",
          htmlTitle: "Landing",
          metaDescription: "",
          featuredImageAltText: "",
          widgets: {},
          layoutSections,
          widgetContainers: {},
        },
      },
    ]);
  });

  it("fails the list when HubSpot rejects the request", async () => {
    const client = createHubspotContentClientFromSdk(
      sdkWith(async () => jsonResponse(403, { message: "missing scope" })),
    );
    await expect(client.listMessageTemplates()).rejects.toThrow(
      "hubspot_message_template_request_failed:403",
    );
  });
});
