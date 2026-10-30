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
import { layoutSectionsFromTemplateFiles, resolveTemplatePath } from "./template-copy";

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
});
