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
  applyApprovedHubspotHtmlTranslations,
  applyApprovedHubspotTranslations,
  buildHubspotEmailRemoteEnvelopeHtml,
} from "./apply-approved-translations";
import {
  applyEmailDocument,
  applyFormDocument,
  buildEmailDocument,
  buildEmailHtmlDocument,
  buildFormDocument,
  flattenHubspotDocument,
  readEmailHtmlDocument,
} from "./document";

describe("applyApprovedHubspotTranslations", () => {
  it("uses approved, then remote, then source", () => {
    expect(
      applyApprovedHubspotTranslations({
        source: { subject: "Welcome", body: "Hello", footer: "Bye" },
        remote: { subject: "Bienvenue", body: "Bonjour" },
        approved: { subject: "Sujet" },
      }),
    ).toEqual({ subject: "Sujet", body: "Bonjour", footer: "Bye" });
  });

  it("keeps remote form labels when only submit text is approved", () => {
    const sourceDefinition = {
      displayOptions: { submitButtonText: "Send" },
      fieldGroups: [
        {
          groupType: "default_group",
          fields: [{ name: "email", label: "Email", placeholder: "you@example.com" }],
        },
      ],
    };
    const remoteDefinition = {
      displayOptions: { submitButtonText: "Envoyer" },
      fieldGroups: [
        {
          groupType: "default_group",
          fields: [{ name: "email", label: "Courriel", placeholder: "vous@example.com" }],
        },
      ],
    };
    const applied = applyFormDocument(
      remoteDefinition,
      applyApprovedHubspotTranslations({
        source: buildFormDocument(sourceDefinition),
        remote: buildFormDocument(remoteDefinition),
        approved: { submitText: "Envoyer maintenant" },
      }),
    );
    expect(applied.displayOptions?.submitButtonText).toBe("Envoyer maintenant");
    expect(applied.fieldGroups?.[0]?.fields?.[0]?.label).toBe("Courriel");
    expect(applied.fieldGroups?.[0]?.fields?.[0]?.placeholder).toBe("vous@example.com");
  });
});

describe("applyApprovedHubspotHtmlTranslations", () => {
  it("keeps remote copy for unapproved email nodes instead of source language", () => {
    const source = buildEmailDocument({
      subject: "Welcome",
      widgets: { module: { body: "Hello world" } },
    });
    const storedEnvelopeHtml = buildEmailHtmlDocument(source);
    const remoteEnvelopeHtml = buildHubspotEmailRemoteEnvelopeHtml({
      storedEnvelopeHtml,
      remote: {
        subject: "Bienvenue",
        widgets: { module: { body: "Bonjour le monde" } },
      },
    });
    const entries = extractHtmlIngestEntries(storedEnvelopeHtml);
    const subjectKey = Object.entries(entries).find(([, text]) => text.trim() === "Welcome")?.[0];
    expect(subjectKey).toBeTruthy();

    const merged = readEmailHtmlDocument(
      applyApprovedHubspotHtmlTranslations({
        storedEnvelopeHtml,
        remoteEnvelopeHtml,
        approved: { [subjectKey!]: "Sujet" },
      }),
    );
    const applied = applyEmailDocument(
      { module: { id: "widget-1", body: "Bonjour le monde" } },
      merged,
    );

    expect(merged.subject).toBe("Sujet");
    expect(flattenHubspotDocument(merged)["widgets.module.body"]).toBe("Bonjour le monde");
    expect(applied.subject).toBe("Sujet");
    expect(applied.widgets).toMatchObject({
      module: { id: "widget-1", body: "Bonjour le monde" },
    });
  });

  it("falls back to stored source fields when the remote copy has none", () => {
    const source = buildEmailDocument({
      subject: "Welcome",
      widgets: { module: { body: "Hello" } },
    });
    const storedEnvelopeHtml = buildEmailHtmlDocument(source);
    const entries = extractHtmlIngestEntries(storedEnvelopeHtml);
    const bodyKey = Object.entries(entries).find(([, text]) => text.trim() === "Hello")?.[0];
    expect(bodyKey).toBeTruthy();

    const merged = readEmailHtmlDocument(
      applyApprovedHubspotHtmlTranslations({
        storedEnvelopeHtml,
        approved: { [bodyKey!]: "Salut" },
      }),
    );

    expect(merged.subject).toBe("Welcome");
    expect(flattenHubspotDocument(merged)["widgets.module.body"]).toBe("Salut");
  });
});
