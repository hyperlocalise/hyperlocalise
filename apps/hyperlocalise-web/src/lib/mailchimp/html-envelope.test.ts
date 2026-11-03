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

import { extractHtmlIngestEntries } from "@/lib/projects/files/html-ingest-entries";

import {
  parseMailchimpEnvelope,
  restoreMailchimpEnvelopeForPush,
  serializeMailchimpEnvelope,
} from "./html-envelope";

describe("mailchimp html envelope", () => {
  it("round-trips nested email markup and merge tags", () => {
    const html =
      '<!DOCTYPE html><html><head><title>Hi *|FNAME|*</title></head><body><div class="mceColumn"><p>Hello</p></div></body></html>';
    const serialized = serializeMailchimpEnvelope({
      subject: "Subject *|LNAME|*",
      previewText: "Preview",
      fromName: "Hyperlocalise",
      html,
    });
    const parsed = parseMailchimpEnvelope(serialized.html);
    expect(parsed.fromName).toBe("Hyperlocalise");
    expect(parsed.htmlBody).toContain('<div class="mceColumn">');
    expect(parsed.htmlBody).toContain("<!--HL_MC_VAR_");
    expect(parsed.subject).toContain("<!--HL_MC_VAR_");
    expect(restoreMailchimpEnvelopeForPush(parsed, serialized.htmlTokens).htmlBody).toContain(
      "*|FNAME|*",
    );
  });

  it("does not store htmlBody as escaped text", () => {
    const serialized = serializeMailchimpEnvelope({
      subject: "S",
      html: "<p>Body</p>",
    });
    expect(serialized.html).not.toContain("&lt;p&gt;Body&lt;/p&gt;");
    expect(serialized.html).toContain('<div data-hl-mailchimp-field="htmlBody"><p>Body</p></div>');
  });

  it("extracts translatable strings from inner email markup", () => {
    const serialized = serializeMailchimpEnvelope({
      subject: "Campaign subject",
      fromName: "Brand",
      html: "<html><body><p>Shop the sale</p></body></html>",
    });
    const entries = extractHtmlIngestEntries(serialized.html);
    const texts = Object.values(entries);
    expect(texts).toContain("Campaign subject");
    expect(texts).toContain("Brand");
    expect(texts).toContain("Shop the sale");
  });
});
