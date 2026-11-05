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
import { describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/hyperlocalise_test";
});

import { extractHtmlIngestEntries } from "@/lib/projects/files/html-ingest-entries";

import {
  applyApprovedBrazeContentBlockEnvelope,
  applyApprovedBrazeEmailEnvelope,
  buildBrazeContentBlockSourcePath,
  buildBrazeEmailSourcePath,
  parseBrazeContentBlockEnvelope,
  parseBrazeEmailEnvelope,
  restoreBrazeContentBlockEnvelope,
  restoreBrazeEmailEnvelope,
  serializeBrazeContentBlockEnvelope,
  serializeBrazeContentBlockRemoteEnvelope,
  serializeBrazeEmailEnvelope,
  serializeBrazeEmailRemoteEnvelope,
} from "./html-envelope";

describe("braze html envelope", () => {
  it("round-trips nested email markup and Liquid", () => {
    const fields = {
      subject: "Welcome {{${first_name}}}",
      preheader: "A short intro",
      body: '<div class="wrap"><div>Hello</div><p>World</p></div>{% if user %}<p>Hi</p>{% endif %}',
      plaintext_body: "Hello {{${first_name}}}",
    };
    const serialized = serializeBrazeEmailEnvelope(fields);
    const parsed = parseBrazeEmailEnvelope(serialized.html);
    expect(parsed.body).toBe(
      '<div class="wrap"><div>Hello</div><p>World</p></div><!--HL_BRAZE_LIQUID_0--><p>Hi</p><!--HL_BRAZE_LIQUID_1-->',
    );
    expect(restoreBrazeEmailEnvelope(parsed, serialized.tokensByField)).toEqual(fields);
  });

  it("round-trips empty optional email fields", () => {
    const fields = { subject: "Hi", body: "<p>Only body</p>" };
    const serialized = serializeBrazeEmailEnvelope(fields);
    const parsed = parseBrazeEmailEnvelope(serialized.html);
    expect(parsed.preheader).toBeUndefined();
    expect(parsed.plaintext_body).toBeUndefined();
    expect(restoreBrazeEmailEnvelope(parsed, serialized.tokensByField)).toEqual({
      subject: "Hi",
      body: "<p>Only body</p>",
    });
  });

  it("round-trips nested Content Block markup", () => {
    const fields = {
      content: '<div class="card"><div>Promo</div></div>{{custom_attribute.${plan}}}',
    };
    const serialized = serializeBrazeContentBlockEnvelope(fields);
    const parsed = parseBrazeContentBlockEnvelope(serialized.html);
    expect(parsed.content).toContain('<div class="card"><div>Promo</div></div>');
    expect(restoreBrazeContentBlockEnvelope(parsed, serialized.tokensByField)).toEqual(fields);
  });

  it("keeps body markup after a nested </body> tag", () => {
    const html = [
      "<!doctype html><html><body>",
      '<div data-hl-braze-field="subject">Hi</div>',
      '<div data-hl-braze-field="preheader"></div>',
      '<div data-hl-braze-field="body"><table><tr><td></body></td></tr></table><p>After</p></div>',
      '<div data-hl-braze-field="plaintext_body">plain</div>',
      "</body></html>",
    ].join("");
    expect(parseBrazeEmailEnvelope(html)).toEqual({
      subject: "Hi",
      preheader: undefined,
      body: "<table><tr><td></body></td></tr></table><p>After</p>",
      plaintext_body: "plain",
    });
  });

  it("keeps collision-safe source paths for same-name items", () => {
    expect(buildBrazeEmailSourcePath({ templateId: "tmpl_a", templateName: "Welcome" })).not.toBe(
      buildBrazeEmailSourcePath({ templateId: "tmpl_b", templateName: "Welcome" }),
    );
    expect(buildBrazeContentBlockSourcePath({ contentBlockId: "cb_a", name: "Hero" })).not.toBe(
      buildBrazeContentBlockSourcePath({ contentBlockId: "cb_b", name: "Hero" }),
    );
    expect(buildBrazeEmailSourcePath({ templateId: "tmpl_a", templateName: "Welcome" })).toMatch(
      /^braze\/templates\/welcome-[a-f0-9]{8}\.html$/,
    );
  });

  it("keeps remote body when only the subject is approved", () => {
    const stored = serializeBrazeEmailEnvelope({
      subject: "Spring Sale",
      preheader: "Preview",
      body: "<p>Shop the sale</p><p>Ends Friday</p>",
      plaintext_body: "Shop the sale",
    });
    const remote = serializeBrazeEmailRemoteEnvelope({
      storedEnvelopeHtml: stored.html,
      remote: {
        subject: "Soldes de printemps",
        preheader: "Aperçu",
        body: "<p>Profitez des soldes</p><p>Jusqu'à vendredi</p>",
        plaintext_body: "Profitez des soldes",
      },
    });
    const entries = extractHtmlIngestEntries(stored.html);
    const subjectKey = Object.keys(entries).find((key) => entries[key] === "Spring Sale");
    expect(subjectKey).toBeDefined();

    const merged = applyApprovedBrazeEmailEnvelope({
      storedEnvelopeHtml: stored.html,
      remoteEnvelopeHtml: remote.html,
      approved: { [subjectKey!]: "Soldes" },
    });

    expect(merged.subject).toBe("Soldes");
    expect(merged.preheader).toBe("Aperçu");
    expect(merged.body).toContain("Profitez des soldes");
    expect(merged.body).toContain("Jusqu'à vendredi");
    expect(merged.body).not.toContain("Shop the sale");
    expect(merged.body).not.toContain("Ends Friday");
    expect(merged.plaintext_body).toBe("Profitez des soldes");
  });

  it("keeps remote copy text for unapproved email nodes instead of source language", () => {
    const stored = serializeBrazeEmailEnvelope({
      subject: "Welcome",
      preheader: "Preview",
      body: "<p>Hello</p><p>World</p>",
    });
    const entries = extractHtmlIngestEntries(stored.html);
    const helloKey = Object.keys(entries).find((key) => entries[key] === "Hello");
    expect(helloKey).toBeDefined();

    const remote = serializeBrazeEmailRemoteEnvelope({
      storedEnvelopeHtml: stored.html,
      remote: {
        subject: "Bienvenue",
        preheader: "Aperçu",
        body: "<p>Bonjour</p><p>Monde</p>",
      },
    });
    const merged = applyApprovedBrazeEmailEnvelope({
      storedEnvelopeHtml: stored.html,
      remoteEnvelopeHtml: remote.html,
      approved: { [helloKey!]: "Salut" },
    });

    expect(merged.subject).toBe("Bienvenue");
    expect(merged.preheader).toBe("Aperçu");
    expect(merged.body).toContain("Salut");
    expect(merged.body).toContain("Monde");
    expect(merged.body).not.toContain("World");
    expect(merged.body).not.toContain("Hello");
  });

  it("falls back to stored source fields when the remote copy has none", () => {
    const stored = serializeBrazeEmailEnvelope({
      subject: "Welcome",
      body: "<p>Hello</p>",
    });
    const entries = extractHtmlIngestEntries(stored.html);
    const helloKey = Object.keys(entries).find((key) => entries[key] === "Hello");
    expect(helloKey).toBeDefined();

    const merged = applyApprovedBrazeEmailEnvelope({
      storedEnvelopeHtml: stored.html,
      approved: { [helloKey!]: "Salut" },
    });

    expect(merged.subject).toBe("Welcome");
    expect(merged.body).toContain("Salut");
  });

  it("keeps remote content-block text for unapproved nodes", () => {
    const stored = serializeBrazeContentBlockEnvelope({
      content: "<p>Hello</p><p>World</p>",
    });
    const entries = extractHtmlIngestEntries(stored.html);
    const helloKey = Object.keys(entries).find((key) => entries[key] === "Hello");
    expect(helloKey).toBeDefined();

    const remote = serializeBrazeContentBlockRemoteEnvelope({
      storedEnvelopeHtml: stored.html,
      remoteContent: "<p>Bonjour</p><p>Monde</p>",
    });
    const merged = applyApprovedBrazeContentBlockEnvelope({
      storedEnvelopeHtml: stored.html,
      remoteEnvelopeHtml: remote.html,
      approved: { [helloKey!]: "Salut" },
    });

    expect(merged.content).toContain("Salut");
    expect(merged.content).toContain("Monde");
    expect(merged.content).not.toContain("World");
  });

  it("restores remote Liquid after a subject-only approval", () => {
    const stored = serializeBrazeEmailEnvelope({
      subject: "Hello {{${first_name}}}",
      body: "<p>Shop {{${campaign.${name}}}}</p><p>World</p>",
    });
    const entries = extractHtmlIngestEntries(stored.html);
    const subjectKey = Object.keys(entries).find((key) => entries[key].includes("Hello"));
    expect(subjectKey).toBeDefined();

    const remote = serializeBrazeEmailRemoteEnvelope({
      storedEnvelopeHtml: stored.html,
      remote: {
        subject: "Bonjour {{${first_name}}}",
        body: "<p>Achetez {{${campaign.${name}}}}</p><p>Monde</p>",
      },
    });
    const merged = restoreBrazeEmailEnvelope(
      applyApprovedBrazeEmailEnvelope({
        storedEnvelopeHtml: stored.html,
        remoteEnvelopeHtml: remote.html,
        approved: { [subjectKey!]: entries[subjectKey!]!.replace("Hello", "Salut") },
      }),
      remote.tokensByField,
    );

    expect(merged.subject).toBe("Salut {{${first_name}}}");
    expect(merged.body).toContain("{{${campaign.${name}}}}");
    expect(merged.body).toContain("Monde");
    expect(merged.body).not.toContain("World");
    expect(merged.subject).not.toContain("<!--HL_BRAZE_LIQUID_");
    expect(merged.body).not.toContain("<!--HL_BRAZE_LIQUID_");
  });
});
