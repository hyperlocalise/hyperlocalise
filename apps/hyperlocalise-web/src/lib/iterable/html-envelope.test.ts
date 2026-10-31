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
  SAMPLE_EMAIL_TEMPLATE_GET,
  SAMPLE_INAPP_TEMPLATE_GET,
  SAMPLE_PUSH_TEMPLATE_GET,
  SAMPLE_SMS_TEMPLATE_GET,
  SAMPLE_SNIPPET_GET,
} from "./client.real-api.fixture";
import {
  applyApprovedIterableHtmlTranslations,
  applyApprovedIterablePushTranslations,
  applyApprovedIterableSmsTranslations,
  parseIterableEmailEnvelope,
  parseIterableInAppEnvelope,
  parseIterablePushEnvelope,
  parseIterableSmsEnvelope,
  parseIterableSnippetHtml,
  restoreIterableEmailEnvelope,
  restoreIterableSnippetContent,
  serializeIterableEmailEnvelope,
  serializeIterableEmailRemoteEnvelope,
  serializeIterableInAppEnvelope,
  serializeIterablePushEnvelope,
  serializeIterableSmsEnvelope,
  serializeIterableSnippetHtml,
  serializeIterableSnippetRemoteEnvelope,
} from "./html-envelope";

describe("iterable html envelopes", () => {
  it("round-trips email fields from sample payload", () => {
    const template = SAMPLE_EMAIL_TEMPLATE_GET;
    const { html, tokensByField } = serializeIterableEmailEnvelope({
      subject: template.subject ?? "",
      preheaderText: template.preheaderText,
      html: template.html ?? "",
      plainText: template.plainText,
    });
    const parsed = restoreIterableEmailEnvelope(parseIterableEmailEnvelope(html), tokensByField);

    expect(parsed.subject).toBe(template.subject);
    expect(parsed.preheaderText).toBe(template.preheaderText);
    expect(parsed.html).toBe(template.html);
    expect(parsed.plainText).toBe(template.plainText);
  });

  it("round-trips in-app fields from sample payload", () => {
    const template = SAMPLE_INAPP_TEMPLATE_GET;
    const { html } = serializeIterableInAppEnvelope({
      html: template.html,
    });
    const parsed = parseIterableInAppEnvelope(html);

    expect(parsed.html).toBe(template.html);
  });

  it("round-trips push and sms json envelopes", () => {
    const push = SAMPLE_PUSH_TEMPLATE_GET;
    const sms = SAMPLE_SMS_TEMPLATE_GET;

    expect(
      parseIterablePushEnvelope(
        serializeIterablePushEnvelope({
          title: push.title ?? "",
          message: push.message ?? "",
        }),
      ),
    ).toEqual({ title: push.title, message: push.message });

    expect(
      parseIterableSmsEnvelope(
        serializeIterableSmsEnvelope({
          message: sms.message ?? "",
        }),
      ),
    ).toEqual({ message: sms.message });
  });

  it("round-trips snippet html from sample payload", () => {
    const content = SAMPLE_SNIPPET_GET.snippet.content;
    const { html, tokensByField } = serializeIterableSnippetHtml(content);
    const parsed = parseIterableSnippetHtml(html);
    expect(restoreIterableSnippetContent(parsed, tokensByField.content)).toBe(content);
  });

  it("keeps remote copy for unapproved HTML nodes instead of source language", () => {
    const sourceHtml = serializeIterableEmailEnvelope({
      subject: "Welcome",
      preheaderText: "Preview",
      html: "<p>Hello</p><p>World</p>",
      plainText: "Hello World",
    }).html;
    const entries = extractHtmlIngestEntries(sourceHtml);
    const helloKey = Object.keys(entries).find((key) => entries[key] === "Hello");
    expect(helloKey).toBeDefined();

    const remoteEnvelope = serializeIterableEmailRemoteEnvelope({
      storedEnvelopeHtml: sourceHtml,
      remote: {
        subject: "Bienvenue",
        preheaderText: "Aperçu",
        html: "<p>Bonjour</p><p>Monde</p>",
        plainText: "Bonjour Monde",
      },
    });
    const merged = parseIterableEmailEnvelope(
      applyApprovedIterableHtmlTranslations({
        storedEnvelopeHtml: sourceHtml,
        remoteEnvelopeHtml: remoteEnvelope.html,
        approved: { [helloKey!]: "Salut" },
      }),
    );

    expect(merged.subject).toBe("Bienvenue");
    expect(merged.preheaderText).toBe("Aperçu");
    expect(merged.html).toContain("Salut");
    expect(merged.html).toContain("Monde");
    expect(merged.html).not.toContain("World");
    expect(merged.html).not.toContain("Welcome");
    expect(merged.plainText).toBe("Bonjour Monde");
  });

  it("falls back to stored source fields when the remote variant has none", () => {
    const sourceHtml = serializeIterableEmailEnvelope({
      subject: "Welcome",
      html: "<p>Hello</p>",
    }).html;
    const entries = extractHtmlIngestEntries(sourceHtml);
    const helloKey = Object.keys(entries).find((key) => entries[key] === "Hello");
    expect(helloKey).toBeDefined();

    const merged = parseIterableEmailEnvelope(
      applyApprovedIterableHtmlTranslations({
        storedEnvelopeHtml: sourceHtml,
        approved: { [helloKey!]: "Salut" },
      }),
    );

    expect(merged.subject).toBe("Welcome");
    expect(merged.html).toContain("Salut");
  });

  it("keeps remote snippet content for unapproved nodes", () => {
    const stored = serializeIterableSnippetHtml("<p>Hello</p><p>World</p>");
    const entries = extractHtmlIngestEntries(stored.html);
    const helloKey = Object.keys(entries).find((key) => entries[key] === "Hello");
    expect(helloKey).toBeDefined();

    const remote = serializeIterableSnippetRemoteEnvelope({
      storedEnvelopeHtml: stored.html,
      remoteContent: "<p>Bonjour</p><p>Monde</p>",
    });
    const merged = parseIterableSnippetHtml(
      applyApprovedIterableHtmlTranslations({
        storedEnvelopeHtml: stored.html,
        remoteEnvelopeHtml: remote.html,
        approved: { [helloKey!]: "Salut" },
      }),
    );

    expect(merged).toContain("Salut");
    expect(merged).toContain("Monde");
    expect(merged).not.toContain("World");
  });

  it("merges push and sms json by approved key, then remote, then source", () => {
    expect(
      applyApprovedIterablePushTranslations({
        source: { title: "Welcome", message: "Hello" },
        remote: { title: "Bienvenue", message: "Bonjour" },
        approved: { title: "Salut" },
      }),
    ).toEqual({ title: "Salut", message: "Bonjour" });

    expect(
      applyApprovedIterableSmsTranslations({
        source: { message: "Hello" },
        remote: { message: "Bonjour" },
        approved: {},
      }),
    ).toEqual({ message: "Bonjour" });

    expect(
      applyApprovedIterableSmsTranslations({
        source: { message: "Hello" },
        approved: { message: "Salut" },
      }),
    ).toEqual({ message: "Salut" });
  });
});
