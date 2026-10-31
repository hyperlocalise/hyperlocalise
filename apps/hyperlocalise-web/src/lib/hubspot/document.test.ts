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
  applyEmailDocument,
  applyFormDocument,
  applyPageDocument,
  applyBlogContentDocument,
  buildBlogContentDocument,
  buildBlogDocument,
  buildEmailDocument,
  buildEmailHtmlDocument,
  buildFormDocument,
  buildMessageTemplateDocument,
  buildPageDocument,
  mergeHubspotTranslations,
  messageTemplateHasCopy,
  extractEmailStyleSettings,
  readBlogDocument,
  readEmailHtmlDocument,
  readMessageTemplateDocument,
} from "./document";

describe("hubspot documents", () => {
  it("lifts preview text and leaves widget ids, urls, and colors out of the tree", () => {
    const document = buildEmailDocument({
      subject: "Hello",
      widgets: {
        module: {
          id: "widget-1",
          body: "Welcome",
          href: "https://example.com",
          color: "#ff4800",
          preview_text: "See you soon",
        },
      },
    });

    expect(document.subject).toBe("Hello");
    expect(document.previewText).toBe("See you soon");
    expect(JSON.stringify(document)).not.toContain("widget-1");
    expect(JSON.stringify(document)).not.toContain("https://example.com");
    expect(JSON.stringify(document)).not.toContain("#ff4800");
    expect(document.widgets).toEqual({ module: { body: "Welcome" } });
  });

  it("writes translations back onto existing widget strings", () => {
    const source = buildEmailDocument({
      subject: "Hello",
      widgets: { module: { body: "Welcome", preview_text: "Soon" } },
    });
    const translated = mergeHubspotTranslations(source, {
      subject: "Bonjour",
      "widgets.module.body": "Bienvenue",
      previewText: "Bientot",
      "widgets.module.missing": "skip",
    });
    const applied = applyEmailDocument(
      { module: { id: "widget-1", body: "Welcome", preview_text: "Soon" } },
      translated,
    );
    expect(applied.subject).toBe("Bonjour");
    expect(applied.widgets).toMatchObject({
      module: { id: "widget-1", body: "Bienvenue", preview_text: "Bientot" },
    });
  });

  it("keeps form field names locked and updates labels", () => {
    const definition = {
      displayOptions: { submitButtonText: "Send" },
      fieldGroups: [
        {
          fields: [
            {
              name: "email",
              label: "Email",
              placeholder: "you@example.com",
              options: [{ value: "yes", label: "Yes" }],
            },
          ],
        },
      ],
    };
    const document = buildFormDocument(definition);
    expect(document.fields).toEqual({
      email: {
        label: "Email",
        placeholder: "you@example.com",
        options: { yes: "Yes" },
      },
    });
    const translated = mergeHubspotTranslations(document, {
      submitText: "Envoyer",
      "fields.email.label": "Courriel",
      "fields.email.options.yes": "Oui",
    });
    const applied = applyFormDocument(definition, translated);
    const field = (applied.fieldGroups as Array<{ fields: Array<Record<string, unknown>> }>)[0]
      ?.fields[0];
    expect(field?.name).toBe("email");
    expect(field?.label).toBe("Courriel");
    expect((applied.displayOptions as { submitButtonText: string }).submitButtonText).toBe(
      "Envoyer",
    );
  });

  it("keeps page widget ids locked and writes layout copy back", () => {
    const live = {
      htmlTitle: "Pricing",
      metaDescription: "Plans",
      featuredImageAltText: "Chart",
      widgets: { hero: { id: "hero-1", body: "Start", href: "https://example.com" } },
      layoutSections: { main: { richText: "Hello" } },
    };
    const document = buildPageDocument(live);
    expect(JSON.stringify(document)).not.toContain("hero-1");
    expect(JSON.stringify(document)).not.toContain("https://example.com");
    expect(document.layoutSections).toEqual({ main: { richText: "Hello" } });
    const translated = mergeHubspotTranslations(document, {
      htmlTitle: "Tarifs",
      "layoutSections.main.richText": "Bonjour",
      "widgets.hero.body": "Commencer",
    });
    const applied = applyPageDocument(live, translated);
    expect(applied.htmlTitle).toBe("Tarifs");
    expect(applied.widgets).toMatchObject({ hero: { id: "hero-1", body: "Commencer" } });
    expect(applied.layoutSections).toEqual({ main: { richText: "Bonjour" } });
  });

  it("reads page copy stored in layout rows and widget container lists", () => {
    const live = {
      htmlTitle: "",
      metaDescription: "",
      featuredImageAltText: "",
      widgets: {},
      layoutSections: {
        dnd_area: {
          rows: [
            {
              "0": {
                rows: [
                  {
                    "0": {
                      params: {
                        html: "<h2>Pricing</h2>",
                        path: "@hubspot/rich_text",
                      },
                      type: "custom_widget",
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      widgetContainers: {
        footer: {
          widgets: [{ body: { html: "Footer line" }, type: "module", id: "footer-1" }],
        },
      },
    };
    const document = buildPageDocument(live);
    expect(document.layoutSections).toEqual({
      dnd_area: {
        rows: {
          "0": {
            "0": {
              rows: {
                "0": {
                  "0": {
                    params: { html: "<h2>Pricing</h2>" },
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(document.widgetContainers).toEqual({
      footer: { widgets: { "0": { body: { html: "Footer line" } } } },
    });
    const translated = mergeHubspotTranslations(document, {
      "layoutSections.dnd_area.rows.0.0.rows.0.0.params.html": "<h2>Tarifs</h2>",
      "widgetContainers.footer.widgets.0.body.html": "Pied de page",
    });
    const applied = applyPageDocument(live, translated);
    expect(applied.layoutSections).toMatchObject({
      dnd_area: {
        rows: [
          {
            "0": {
              rows: [
                {
                  "0": {
                    params: { html: "<h2>Tarifs</h2>", path: "@hubspot/rich_text" },
                    type: "custom_widget",
                  },
                },
              ],
            },
          },
        ],
      },
    });
    expect(applied.widgetContainers).toMatchObject({
      footer: { widgets: [{ id: "footer-1", body: { html: "Pied de page" } }] },
    });
  });

  it("reads module copy stored under value and on layout widgets", () => {
    const live = {
      htmlTitle: "",
      metaDescription: "",
      featuredImageAltText: "",
      widgets: {
        hero: {
          id: "hero",
          type: "module",
          body: {
            html: { value: "<p>Welcome to the homepage with a lot of text.</p>" },
            alignment: { value: "left" },
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
      widgetContainers: {},
    };
    const document = buildPageDocument(live);
    expect(JSON.stringify(document)).toContain("Welcome to the homepage");
    expect(JSON.stringify(document)).toContain("Section copy that the editor shows");
    expect(JSON.stringify(document)).not.toContain("left");
    const translated = mergeHubspotTranslations(document, {
      "widgets.hero.body.html.value": "<p>Bienvenue sur la page d'accueil.</p>",
    });
    const applied = applyPageDocument(live, translated);
    expect(applied.widgets).toMatchObject({
      hero: {
        id: "hero",
        type: "module",
        body: {
          html: { value: "<p>Bienvenue sur la page d'accueil.</p>" },
          alignment: { value: "left" },
        },
      },
    });
  });

  it("reads section html nested inside a value object", () => {
    const live = {
      htmlTitle: "Launch",
      metaDescription: "",
      featuredImageAltText: "",
      postBody: "<p>The opening paragraph of the article.</p>",
      postSummary: "",
      rssBody:
        "<h2>Section heading with a lot of text</h2><p>Section body copy that was missing.</p>",
      rssSummary: "",
      widgets: {
        hero: {
          body: {
            richtext_field: {
              value: {
                content:
                  "<h2>Section heading with a lot of text</h2><p>Section body copy that was missing.</p>",
                type: "html",
              },
            },
          },
        },
      },
      layoutSections: {},
    };
    const document = buildBlogContentDocument(live);
    const serialized = JSON.stringify(document);
    expect(serialized).toContain("The opening paragraph of the article");
    expect(serialized).toContain("Section body copy that was missing");
    expect(serialized).not.toContain('"type":"html"');
    expect(document.rssBody).toBe(live.rssBody);
  });

  it("keeps blog section text with the post body", () => {
    const live = {
      htmlTitle: "Launch",
      metaDescription: "Notes",
      featuredImageAltText: "",
      postBody: "<p>Intro</p>",
      postSummary: "A short summary",
      rssSummary: "",
      widgets: {},
      layoutSections: {
        dnd_area: {
          rows: [
            {
              "0": {
                params: { html: "<h2>Section heading with a lot of text</h2>" },
              },
            },
          ],
        },
      },
    };
    const document = buildBlogContentDocument(live);
    expect(document.postBody).toBe("<p>Intro</p>");
    expect(document.postSummary).toBe("A short summary");
    expect(document.layoutSections).toEqual({
      dnd_area: {
        rows: { "0": { "0": { params: { html: "<h2>Section heading with a lot of text</h2>" } } } },
      },
    });
    const applied = applyBlogContentDocument(live, {
      ...document,
      postBody: "<p>Introduction</p>",
      layoutSections: {
        dnd_area: {
          rows: { "0": { "0": { params: { html: "<h2>Titre de section</h2>" } } } },
        },
      },
    });
    expect(applied.postBody).toBe("<p>Introduction</p>");
    expect(applied.layoutSections).toMatchObject({
      dnd_area: {
        rows: [{ "0": { params: { html: "<h2>Titre de section</h2>" } } }],
      },
    });
  });

  it("round-trips blog title, description, and body", () => {
    const html = buildBlogDocument({
      htmlTitle: "Launch & more",
      metaDescription: "A <note>",
      postBody: "<p>Body</p>",
    });
    expect(readBlogDocument(html)).toEqual({
      htmlTitle: "Launch & more",
      metaDescription: "A <note>",
      postBody: "<p>Body</p>",
    });
  });

  it("drops email widget settings but keeps html and alt copy", () => {
    const document = buildEmailDocument({
      subject: "Newsletter",
      widgets: {
        "module-0-0-0": {
          body: {
            alignment: "center",
            img: { alt: "HubSpot logo white" },
            style: {
              alignment: "center",
              border_style: "none",
              corner_radius_unit: "%",
            },
          },
        },
        "module-2-0-0": {
          body: { html: "<h1>Share your latest news</h1>" },
        },
        "module-7-0-0": {
          body: {
            align: "center",
            font: { font: "Arial, sans-serif", size: { units: "px" } },
            unsubscribe_link_type: "both",
          },
        },
      },
    });
    expect(JSON.stringify(document)).not.toContain("center");
    expect(JSON.stringify(document)).not.toContain("Arial");
    expect(document.widgets).toEqual({
      "module-0-0-0": { body: { img: { alt: "HubSpot logo white" } } },
      "module-2-0-0": { body: { html: "<h1>Share your latest news</h1>" } },
    });
    const html = buildEmailHtmlDocument(document);
    expect(html).not.toContain(">center<");
    expect(html).toContain("HubSpot logo white");
    expect(html).toContain("Share your latest news");
  });

  it("round-trips email text and rich-text widgets through the html envelope", () => {
    const source = buildEmailDocument({
      subject: "Hello & welcome",
      widgets: {
        header: { body: "Plain greeting" },
        hero: {
          body: { html: '<p>Hi <a href="https://example.com">there</a></p>' },
        },
        nested: {
          body: { html: "<section><p>Inner section</p></section><p>{{ contact.firstname }}</p>" },
        },
      },
    });
    const html = buildEmailHtmlDocument(source);
    expect(html).toContain('data-hl-kind="text"');
    expect(html).toContain('data-hl-kind="html"');
    expect(html).toContain("<!--/hl-field-->");
    expect(readEmailHtmlDocument(html)).toEqual(source);
  });

  it("round-trips email style settings without segmenting them", () => {
    const source = buildEmailDocument({
      subject: "Hello",
      widgets: { module: { body: "Welcome" } },
    });
    const styleSettings = {
      backgroundColor: "#ffffff",
      emailBodyWidth: "600",
      primaryFont: "Arial",
    };
    const html = buildEmailHtmlDocument(source, { styleSettings });
    expect(html).toContain('data-hl-meta="styleSettings"');
    expect(extractEmailStyleSettings(html)).toEqual(styleSettings);
    expect(readEmailHtmlDocument(html)).toEqual(source);
    expect(extractEmailStyleSettings(buildEmailHtmlDocument(source))).toBeUndefined();
  });

  it("round-trips message template subject and body and skips token-only copy", () => {
    expect(messageTemplateHasCopy({ subject: "", body: "<p>{{ contact.firstname }}</p>" })).toBe(
      false,
    );
    expect(messageTemplateHasCopy({ subject: "Hello", body: "" })).toBe(true);
    const html = buildMessageTemplateDocument({
      subject: "Hello & welcome",
      body: "<p>Hi {{ contact.firstname }}</p>",
    });
    expect(readMessageTemplateDocument(html)).toEqual({
      subject: "Hello & welcome",
      body: "<p>Hi {{ contact.firstname }}</p>",
      foundSubject: true,
      foundBody: true,
    });
  });
});
