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
  applyLoopsSegmentTranslations,
  buildLoopsEmailSourcePath,
  extractLoopsTextSegments,
  isLoopsLocaleCopyName,
  loopsEmailCopyName,
  parseLoopsEmailEnvelope,
  serializeLoopsEmailEnvelope,
  toLoopsLanguageCode,
} from "./html-envelope";

const LMX = [
  "<Document>",
  "<Paragraph>Hi {data.name},</Paragraph>",
  "<Paragraph>Your order is ready.</Paragraph>",
  "<Paragraph>   </Paragraph>",
  "</Document>",
].join("");

describe("extractLoopsTextSegments", () => {
  it("extracts text runs between LMX tags and skips whitespace", () => {
    expect(extractLoopsTextSegments(LMX)).toEqual(["Hi {data.name},", "Your order is ready."]);
  });

  it("ignores markup-only content", () => {
    expect(extractLoopsTextSegments('<Document><Image src="x" /></Document>')).toEqual([]);
  });
});

describe("loops HTML envelope", () => {
  it("round-trips subject, preview text, and segments", () => {
    const { html } = serializeLoopsEmailEnvelope({
      subject: "Welcome {data.name}",
      previewText: "A quick preview",
      lmx: LMX,
    });

    const parsed = parseLoopsEmailEnvelope(html);

    expect(parsed.subject).toBe("Welcome <!--HL_LOOPS_VAR_0-->");
    expect(parsed.previewText).toBe("A quick preview");
    expect(parsed.segments).toEqual(["Hi <!--HL_LOOPS_VAR_0-->,", "Your order is ready."]);
  });

  it("keeps variable placeholders intact through the envelope", () => {
    const { html, tokensBySegment } = serializeLoopsEmailEnvelope({
      subject: "Hi",
      lmx: LMX,
    });

    expect(tokensBySegment[0]).toEqual(["{data.name}"]);
    // Placeholders are entity-escaped so they survive as visible text in HTML editors.
    expect(html).toContain("&lt;!--HL_LOOPS_VAR_0--&gt;");
    expect(html).not.toContain("{data.name}");
  });
});

describe("applyLoopsSegmentTranslations", () => {
  it("splices translated segments back into the source LMX", () => {
    const out = applyLoopsSegmentTranslations({
      lmx: LMX,
      translatedSegments: ["Bonjour <!--HL_LOOPS_VAR_0-->,", "Votre commande est prête."],
      tokensBySegment: [["{data.name}"], []],
    });

    expect(out).toContain("<Paragraph>Bonjour {data.name},</Paragraph>");
    expect(out).toContain("<Paragraph>Votre commande est prête.</Paragraph>");
  });

  it("leaves missing translations on the source text", () => {
    const out = applyLoopsSegmentTranslations({
      lmx: LMX,
      translatedSegments: [],
      tokensBySegment: [],
    });

    expect(out).toBe(LMX);
  });
});

describe("loops paths and locale copies", () => {
  it("builds stable source paths per resource kind", () => {
    const first = buildLoopsEmailSourcePath({
      kind: "transactional",
      id: "abc",
      name: "Welcome",
    });
    const second = buildLoopsEmailSourcePath({
      kind: "transactional",
      id: "abc",
      name: "Renamed",
    });

    expect(first.startsWith("loops/transactional/welcome-")).toBe(true);
    // The token suffix is stable per id, matching the Braze path convention.
    expect(first.slice(-13)).toBe(second.slice(-13));
    expect(buildLoopsEmailSourcePath({ kind: "campaign", id: "abc", name: "Welcome" })).toContain(
      "loops/campaigns/",
    );
    expect(
      buildLoopsEmailSourcePath({
        kind: "workflow",
        id: "email-1",
        name: "Step",
        parentSlug: "Onboarding",
      }),
    ).toContain("loops/workflows/onboarding/");
  });

  it("names locale copies like the Loops dashboard convention", () => {
    expect(loopsEmailCopyName("Welcome", "fr")).toBe("Welcome [fr]");
    expect(isLoopsLocaleCopyName("Welcome [fr]")).toBe(true);
    expect(isLoopsLocaleCopyName("Welcome")).toBe(false);
  });

  it("maps project locales to ISO 639-1 language codes", () => {
    expect(toLoopsLanguageCode("fr")).toBe("fr");
    expect(toLoopsLanguageCode("pt-BR")).toBe("pt");
    expect(toLoopsLanguageCode("zh_Hant")).toBe("zh");
  });
});
