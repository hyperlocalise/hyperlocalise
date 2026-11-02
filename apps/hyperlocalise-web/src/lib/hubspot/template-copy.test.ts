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

import { buildPageDocument, hubspotDocumentHasCopy } from "./document";
import {
  layoutSectionsFromTemplateFiles,
  resolveTemplatePath,
  staticModuleWidgetsFromTemplateFiles,
} from "./template-copy";

const entryPath = "theme/templates/landing-page.html";
const heroPath = "theme/sections/hero.html";

const entry = `{% dnd_area "dnd_area" %}
  {% include_dnd_partial
    path="../sections/hero.html"
    context={
      "content": "<h1>Download your free eBook</h1><p>Tell everyone what your eBook is about.</p>"
    }
  %}
  {% dnd_module path="@hubspot/rich_text" %}
    {% module_attribute "html" %}
      <h2>Provide more details here.</h2>
      <p>Explain what makes your product extraordinary.</p>
    {% end_module_attribute %}
  {% end_dnd_module %}
{% end_dnd_area %}`;

const hero = `{% dnd_module
  path="@hubspot/rich_text"
  html={{ context.content or "<p>Default headline for the hero section.</p>" }}
%}
{% end_dnd_module %}
{% dnd_module path="@hubspot/linked_image" img={ "alt": "Stock placeholder image with grayscale mountains" } %}
{% end_dnd_module %}`;

describe("hubspot template copy", () => {
  it("resolves a section partial next to the template", () => {
    expect(resolveTemplatePath(entryPath, "../sections/hero.html")).toBe(heroPath);
  });

  it("uses include context and inline module copy from the template", () => {
    const layoutSections = layoutSectionsFromTemplateFiles(
      new Map([
        [entryPath, entry],
        [heroPath, hero],
      ]),
      entryPath,
    );
    const document = buildPageDocument({
      htmlTitle: "",
      metaDescription: "",
      featuredImageAltText: "",
      widgets: {},
      layoutSections,
    });
    const serialized = JSON.stringify(document);
    expect(hubspotDocumentHasCopy(document)).toBe(true);
    expect(serialized).toContain("Download your free eBook");
    expect(serialized).toContain("Provide more details here");
    expect(serialized).toContain("grayscale mountains");
    expect(serialized).not.toContain("Default headline");
  });

  it("follows extends and text tags", () => {
    const layout = layoutSectionsFromTemplateFiles(
      new Map([
        [
          "theme/templates/blog-post.html",
          `{% extends "./layouts/base.html" %}
           {% text "kicker" label="Kicker" value="From the journal" %}`,
        ],
        [
          "theme/templates/layouts/base.html",
          `{% dnd_area "dnd_area" %}
             {% include "../sections/read-on.html" %}
           {% end_dnd_area %}`,
        ],
        [
          "theme/templates/sections/read-on.html",
          `{% module_attribute "html" %}
             <h2>Keep reading this section.</h2>
           {% end_module_attribute %}`,
        ],
      ]),
      "theme/templates/blog-post.html",
    );
    const serialized = JSON.stringify(layout);
    expect(serialized).toContain("From the journal");
    expect(serialized).toContain("Keep reading this section");
  });

  it("reads static module defaults outside the drag and drop area", () => {
    const entry = "theme/templates/blog-post.html";
    const widgets = staticModuleWidgetsFromTemplateFiles(
      new Map([
        [
          entry,
          `{% module "subscribe" path="../modules/subscribe.module" heading="Join the newsletter" %}
           {% dnd_area "dnd_area" %}
             {% dnd_module path="@hubspot/rich_text" %}
               {% module_attribute "html" %}
                 <h2>Article only.</h2>
               {% end_module_attribute %}
             {% end_dnd_module %}
           {% end_dnd_area %}`,
        ],
        [
          "theme/modules/subscribe.module/fields.json",
          JSON.stringify([
            { name: "heading", type: "text", default: "Subscribe to the blog" },
            { name: "link", type: "url", default: "https://example.com/subscribe" },
            {
              name: "notes",
              type: "group",
              children: [
                {
                  name: "content",
                  type: "richtext",
                  default: "<p>Weekly notes from the team.</p>",
                },
              ],
            },
          ]),
        ],
      ]),
      entry,
    );
    const serialized = JSON.stringify(widgets);
    expect(serialized).toContain("Join the newsletter");
    expect(serialized).toContain("Weekly notes from the team");
    expect(serialized).not.toContain("Subscribe to the blog");
    expect(serialized).not.toContain("Article only");
    expect(serialized).not.toContain("https://example.com/subscribe");
  });
});
