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

import { applyApprovedLoopsHtmlTranslations } from "./apply-approved-translations";
import { serializeLoopsEmailEnvelope } from "./html-envelope";

const LMX = [
  "<Document>",
  "<Paragraph>Hi {data.name},</Paragraph>",
  "<Paragraph>Your order is ready.</Paragraph>",
  "<Paragraph>   </Paragraph>",
  "</Document>",
].join("");

describe("applyApprovedLoopsHtmlTranslations", () => {
  const sourceEnvelope = serializeLoopsEmailEnvelope({
    subject: "Welcome {data.name}",
    previewText: "A quick preview",
    lmx: LMX,
  });

  it("keeps remote copy for unapproved nodes instead of source language", () => {
    const merged = applyApprovedLoopsHtmlTranslations({
      storedEnvelopeHtml: sourceEnvelope.html,
      storedLmx: LMX,
      remote: {
        subject: "Bienvenue {data.name}",
        previewText: "Un aperçu",
        lmx: [
          "<Document>",
          "<Paragraph>Bonjour {data.name},</Paragraph>",
          "<Paragraph>Votre commande est prête.</Paragraph>",
          "<Paragraph>   </Paragraph>",
          "</Document>",
        ].join(""),
      },
      // Envelope fields are html.body.div, .2 (preview), .3 (segment 0), .4 (segment 1).
      approved: { "html.body.div.4": "C'est prêt." },
      preferRemote: true,
    });

    expect(merged).not.toHaveProperty("diverged");
    if ("diverged" in merged) {
      return;
    }
    expect(merged.subject).toBe("Bienvenue {data.name}");
    expect(merged.previewText).toBe("Un aperçu");
    expect(merged.lmx).toContain("<Paragraph>Bonjour {data.name},</Paragraph>");
    expect(merged.lmx).toContain("<Paragraph>C'est prêt.</Paragraph>");
    expect(merged.lmx).not.toContain("Your order is ready.");
    expect(merged.lmx).not.toContain("Hi {data.name}");
  });

  it("uses the stored source envelope for a new copy", () => {
    const merged = applyApprovedLoopsHtmlTranslations({
      storedEnvelopeHtml: sourceEnvelope.html,
      storedLmx: LMX,
      remote: {
        subject: "Bienvenue {data.name}",
        previewText: "Un aperçu",
        lmx: "<Document><Paragraph>Bonjour {data.name},</Paragraph></Document>",
      },
      approved: { "html.body.div.4": "C'est prêt." },
      preferRemote: false,
    });

    expect(merged).not.toHaveProperty("diverged");
    if ("diverged" in merged) {
      return;
    }
    // New copies rebuild from the stored envelope, whose subject already
    // carries protected `{data.*}` placeholders from import.
    expect(merged.subject).toBe("Welcome <!--HL_LOOPS_VAR_0-->");
    expect(merged.lmx).toContain("<Paragraph>Hi {data.name},</Paragraph>");
    expect(merged.lmx).toContain("<Paragraph>C'est prêt.</Paragraph>");
  });

  it("skips an existing copy whose segment count diverged", () => {
    const merged = applyApprovedLoopsHtmlTranslations({
      storedEnvelopeHtml: sourceEnvelope.html,
      storedLmx: LMX,
      remote: {
        subject: "Bienvenue",
        lmx: "<Document><Paragraph>Bonjour</Paragraph></Document>",
      },
      approved: {},
      preferRemote: true,
    });

    expect(merged).toEqual({ diverged: true });
  });
});
