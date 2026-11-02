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
  HUBSPOT_EMAIL_PREVIEW_STYLE_MARKER,
  hubspotEmailPreviewSrcDoc,
  isHubspotEmailCopyHtml,
} from "./content-editor-hubspot-email-preview";

const EMAIL_COPY = `<!DOCTYPE html>
<html><body>
<script type="application/json" data-hl-meta="styleSettings">{"backgroundColor":"#ffffff","emailBodyWidth":"600","primaryFont":"Arial"}</script>
<section data-hl-field="subject" data-hl-kind="text"><p>Welcome</p><!--/hl-field--></section>
<section data-hl-field="widgets.0.body" data-hl-kind="html"><p>Hi there</p><!--/hl-field--></section>
</body></html>
`;

describe("isHubspotEmailCopyHtml", () => {
  it("detects HubSpot email copy documents", () => {
    expect(isHubspotEmailCopyHtml(EMAIL_COPY)).toBe(true);
  });

  it("ignores plain HTML and message-template documents", () => {
    expect(isHubspotEmailCopyHtml("<p>Hello</p>")).toBe(false);
    expect(isHubspotEmailCopyHtml(`<section data-hl-field="subject"><p>Hi</p></section>`)).toBe(
      false,
    );
  });
});

describe("hubspotEmailPreviewSrcDoc", () => {
  it("leaves other files untouched", () => {
    expect(hubspotEmailPreviewSrcDoc("<p>Hello</p>")).toBe("<p>Hello</p>");
  });

  it("wraps email copy in a preview canvas without touching sections", () => {
    const wrapped = hubspotEmailPreviewSrcDoc(EMAIL_COPY);
    expect(wrapped).toContain(`<style ${HUBSPOT_EMAIL_PREVIEW_STYLE_MARKER}>`);
    expect(wrapped).toContain("max-width:600px");
    expect(wrapped).toContain('data-hl-field="subject"');
    expect(wrapped).toContain('data-hl-meta="styleSettings"');
  });

  it("never double-wraps", () => {
    const once = hubspotEmailPreviewSrcDoc(EMAIL_COPY);
    expect(hubspotEmailPreviewSrcDoc(once)).toBe(once);
  });

  it("applies valid style accents and rejects unsafe values", () => {
    const withAccents = EMAIL_COPY.replace(
      `"backgroundColor":"#ffffff"`,
      `"backgroundColor":"#112233"`,
    );
    expect(hubspotEmailPreviewSrcDoc(withAccents)).toContain("background:#112233");

    const malicious = EMAIL_COPY.replace(
      `"backgroundColor":"#ffffff"`,
      `"backgroundColor":"red;}</style><script>alert(1)</script>"`,
    );
    const wrapped = hubspotEmailPreviewSrcDoc(malicious);
    const canvasCss = /<style data-hl-preview-canvas>([\s\S]*?)<\/style>/.exec(wrapped)?.[1] ?? "";
    expect(canvasCss).not.toContain("alert(1)");
    expect(canvasCss).toContain("background:#f3f4f6");
  });
});
