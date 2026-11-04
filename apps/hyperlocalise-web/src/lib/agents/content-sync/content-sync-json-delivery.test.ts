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

import { buildContentSyncJsonTranslationFile } from "./content-sync-json-delivery";

function build(input: {
  source: unknown;
  existing?: unknown;
  approved: Record<string, string>;
  sourceText?: string;
}) {
  const result = buildContentSyncJsonTranslationFile({
    source: Buffer.from(input.sourceText ?? JSON.stringify(input.source, null, 2), "utf8"),
    existing: input.existing === undefined ? null : Buffer.from(JSON.stringify(input.existing)),
    approved: input.approved,
  });
  return result ? result.toString("utf8") : null;
}

describe("buildContentSyncJsonTranslationFile", () => {
  it("follows the source file's nesting and leaves out keys with no approved text", () => {
    const text = build({
      source: { title: "Home", nav: { about: "About", contact: "Contact" }, count: 3 },
      approved: { title: "Accueil", "nav.about": "À propos" },
    });
    expect(text).toBe(
      `${JSON.stringify({ title: "Accueil", nav: { about: "À propos" }, count: 3 }, null, 2)}\n`,
    );
  });

  it("keeps what the repository's language file had for a key that is back in review", () => {
    const text = build({
      source: { title: "Home", intro: "Welcome" },
      existing: { title: "Accueil (old)", intro: "Bienvenue" },
      approved: { title: "Accueil" },
    });
    expect(JSON.parse(text!)).toEqual({ title: "Accueil", intro: "Bienvenue" });
  });

  it("drops containers that end up empty, and the whole file when nothing is left", () => {
    expect(
      JSON.parse(
        build({
          source: { a: { b: "x" }, c: "y" },
          approved: { c: "z" },
        })!,
      ),
    ).toEqual({ c: "z" });
    expect(build({ source: { a: "x" }, approved: {} })).toBeNull();
  });

  it("holds a list back until every item has text, so positions keep their keys", () => {
    const partial = build({
      source: { steps: ["One", "Two"], title: "T" },
      approved: { "steps[0]": "Un", title: "Titre" },
    });
    expect(JSON.parse(partial!)).toEqual({ title: "Titre" });

    const complete = build({
      source: { steps: ["One", { label: "Two" }] },
      approved: { "steps[0]": "Un", "steps[1].label": "Deux" },
    });
    expect(JSON.parse(complete!)).toEqual({ steps: ["Un", { label: "Deux" }] });
  });

  it("swaps defaultMessage in a FormatJS catalog and keeps the other fields", () => {
    const text = build({
      source: {
        hello: { defaultMessage: "Hello", description: "Greeting" },
        bye: { defaultMessage: "Bye" },
      },
      existing: { bye: { defaultMessage: "Au revoir" } },
      approved: { hello: "Bonjour" },
    });
    expect(JSON.parse(text!)).toEqual({
      hello: { defaultMessage: "Bonjour", description: "Greeting" },
      bye: { defaultMessage: "Au revoir" },
    });
  });

  it("writes with the source file's indentation", () => {
    const tabs = build({
      source: null,
      sourceText: '{\n\t"title": "Home"\n}\n',
      approved: { title: "Accueil" },
    });
    expect(tabs).toBe('{\n\t"title": "Accueil"\n}\n');
    const four = build({
      source: null,
      sourceText: '{\n    "title": "Home"\n}',
      approved: { title: "Accueil" },
    });
    expect(four).toBe('{\n    "title": "Accueil"\n}\n');
  });

  it("gives up on a source that is not a JSON object", () => {
    expect(build({ source: null, sourceText: "[1, 2]", approved: {} })).toBeNull();
    expect(build({ source: null, sourceText: "not json", approved: {} })).toBeNull();
  });
});
