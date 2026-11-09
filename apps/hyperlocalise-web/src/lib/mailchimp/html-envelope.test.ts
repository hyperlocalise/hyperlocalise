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
  applyHtmlIngestTranslations,
  extractHtmlIngestEntries,
} from "@/lib/projects/files/html-ingest-entries";

import {
  applyApprovedMailchimpEnvelope,
  buildMailchimpPushEnvelope,
  parseMailchimpEnvelope,
  restoreMailchimpEnvelopeForPush,
  serializeMailchimpEnvelope,
  serializeMailchimpRemoteEnvelope,
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
    const restored = restoreMailchimpEnvelopeForPush(parsed, serialized.htmlTokens);
    expect(restored.subject).toBe("Subject *|LNAME|*");
    expect(restored.htmlBody).toContain("*|FNAME|*");
    expect(restored.subject).not.toContain("<!--HL_MC_VAR_");
    expect(restored.htmlBody).not.toContain("<!--HL_MC_VAR_");
  });

  it("restores merge tags in subject, preview text, and from name", () => {
    const serialized = serializeMailchimpEnvelope({
      subject: "Hello *|FNAME|*",
      previewText: "Just for *|EMAIL|*",
      fromName: "*|LIST:COMPANY|*",
      html: "<p>Body</p>",
    });
    const restored = restoreMailchimpEnvelopeForPush(
      parseMailchimpEnvelope(serialized.html),
      serialized.htmlTokens,
    );
    expect(restored.subject).toBe("Hello *|FNAME|*");
    expect(restored.previewText).toBe("Just for *|EMAIL|*");
    expect(restored.fromName).toBe("*|LIST:COMPANY|*");
  });

  it("does not store htmlBody as escaped text", () => {
    const serialized = serializeMailchimpEnvelope({
      subject: "S",
      html: "<p>Body</p>",
    });
    expect(serialized.html).not.toContain("&lt;p&gt;Body&lt;/p&gt;");
    expect(serialized.html).toContain("<head>");
    expect(serialized.html).toContain('<title data-hl-mailchimp-field="subject">S</title>');
    expect(serialized.html).toContain('<div data-hl-mailchimp-field="htmlBody"><p>Body</p></div>');
    expect(serialized.html).not.toMatch(/<body[^>]*>[\s\S]*data-hl-mailchimp-field="subject"/);
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

  it("reads metadata from older body field blocks", () => {
    const parsed = parseMailchimpEnvelope(
      '<html><body><div data-hl-mailchimp-field="subject">Old subject</div><div data-hl-mailchimp-field="fromName">Old brand</div><div data-hl-mailchimp-field="htmlBody"><p>Hi</p></div></body></html>',
    );
    expect(parsed.subject).toBe("Old subject");
    expect(parsed.fromName).toBe("Old brand");
    expect(parsed.htmlBody).toBe("<p>Hi</p>");
  });

  it("applies translations to head metadata without writing them into the body", () => {
    const serialized = serializeMailchimpEnvelope({
      subject: "Campaign subject",
      previewText: "Preview line",
      fromName: "Brand",
      html: "<p>Shop the sale</p>",
    });
    const applied = applyHtmlIngestTranslations(serialized.html, {
      "html.head.title": "Sujet",
      "html.head.meta.description": "Aperçu",
      "html.head.meta.author": "Marque",
      "html.body.div.p": "Achetez la vente",
    });
    const parsed = parseMailchimpEnvelope(applied);
    expect(parsed.subject).toBe("Sujet");
    expect(parsed.previewText).toBe("Aperçu");
    expect(parsed.fromName).toBe("Marque");
    expect(parsed.htmlBody).toContain("Achetez la vente");
    expect(applied).not.toMatch(/<body[^>]*>[\s\S]*Sujet/);
  });

  it("keeps remote body when only the subject is approved", () => {
    const stored = serializeMailchimpEnvelope({
      subject: "Spring Sale",
      previewText: "Preview",
      fromName: "Brand",
      html: "<p>Shop the sale</p><p>Ends Friday</p>",
    });
    const remote = serializeMailchimpRemoteEnvelope({
      storedEnvelopeHtml: stored.html,
      remote: {
        subject: "Soldes de printemps",
        previewText: "Aperçu",
        fromName: "Marque",
        html: "<p>Profitez des soldes</p><p>Jusqu'à vendredi</p>",
      },
    });
    const merged = applyApprovedMailchimpEnvelope({
      storedEnvelopeHtml: stored.html,
      remoteEnvelopeHtml: remote.html,
      approved: { "html.head.title": "Soldes" },
    });

    expect(merged.subject).toBe("Soldes");
    expect(merged.previewText).toBe("Aperçu");
    expect(merged.fromName).toBe("Marque");
    expect(merged.htmlBody).toContain("Profitez des soldes");
    expect(merged.htmlBody).toContain("Jusqu'à vendredi");
    expect(merged.htmlBody).not.toContain("Shop the sale");
    expect(merged.htmlBody).not.toContain("Ends Friday");
  });

  it("keeps remote copy text for unapproved nodes instead of source language", () => {
    const stored = serializeMailchimpEnvelope({
      subject: "Welcome",
      previewText: "Preview",
      fromName: "Brand",
      html: "<p>Hello</p><p>World</p>",
    });
    const entries = extractHtmlIngestEntries(stored.html);
    const helloKey = Object.keys(entries).find((key) => entries[key] === "Hello");
    expect(helloKey).toBeDefined();

    const remote = serializeMailchimpRemoteEnvelope({
      storedEnvelopeHtml: stored.html,
      remote: {
        subject: "Bienvenue",
        previewText: "Aperçu",
        fromName: "Marque",
        html: "<p>Bonjour</p><p>Monde</p>",
      },
    });
    const merged = applyApprovedMailchimpEnvelope({
      storedEnvelopeHtml: stored.html,
      remoteEnvelopeHtml: remote.html,
      approved: { [helloKey!]: "Salut" },
    });

    expect(merged.subject).toBe("Bienvenue");
    expect(merged.previewText).toBe("Aperçu");
    expect(merged.fromName).toBe("Marque");
    expect(merged.htmlBody).toContain("Salut");
    expect(merged.htmlBody).toContain("Monde");
    expect(merged.htmlBody).not.toContain("World");
    expect(merged.htmlBody).not.toContain("Hello");
  });

  it("falls back to stored source fields when the remote copy has none", () => {
    const stored = serializeMailchimpEnvelope({
      subject: "Welcome",
      html: "<p>Hello</p>",
    });
    const entries = extractHtmlIngestEntries(stored.html);
    const helloKey = Object.keys(entries).find((key) => entries[key] === "Hello");
    expect(helloKey).toBeDefined();

    const merged = applyApprovedMailchimpEnvelope({
      storedEnvelopeHtml: stored.html,
      approved: { [helloKey!]: "Salut" },
    });

    expect(merged.subject).toBe("Welcome");
    expect(merged.htmlBody).toContain("Salut");
  });

  it("restores source merge tags in approved text when writing onto a remote copy", () => {
    const stored = serializeMailchimpEnvelope({
      subject: "Hello *|FNAME|*",
      html: "<p>Shop *|LIST:NAME|*</p><p>World</p>",
    });
    const entries = extractHtmlIngestEntries(stored.html);
    const subjectKey = Object.keys(entries).find((key) => entries[key].includes("Hello"));
    expect(subjectKey).toBeDefined();

    const remote = serializeMailchimpRemoteEnvelope({
      storedEnvelopeHtml: stored.html,
      remote: {
        subject: "Bonjour *|FNAME|*",
        html: "<p>Achetez *|LIST:NAME|*</p><p>Monde</p>",
      },
    });
    const merged = buildMailchimpPushEnvelope({
      storedEnvelopeHtml: stored.html,
      remoteEnvelope: remote,
      approved: { [subjectKey!]: entries[subjectKey!]!.replace("Hello", "Salut") },
      sourceMergeTokens: stored.htmlTokens,
    });

    expect(merged.subject).toBe("Salut *|FNAME|*");
    expect(merged.htmlBody).toContain("*|LIST:NAME|*");
    expect(merged.htmlBody).toContain("Monde");
    expect(merged.htmlBody).not.toContain("World");
    expect(merged.subject).not.toContain("<!--HL_MC_VAR_");
    expect(merged.htmlBody).not.toContain("<!--HL_MC_VAR_");
  });
});
