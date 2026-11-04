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
  buildContentSyncJsonTranslationFile,
  type JsonTranslationFileOutcome,
} from "./content-sync-json-delivery";

function flatKeys(value: unknown, prefix = "", out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(prefix);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => flatKeys(item, `${prefix}[${index}]`, out));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flatKeys(child, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

function build(input: {
  source: unknown;
  existing?: unknown;
  approved: Record<string, string>;
  sourceText?: string;
  existingText?: string;
  /** Defaults to every string in the source, as the importer would key them. */
  knownKeys?: string[];
  droppedKeys?: string[];
  hiddenKeys?: string[];
  arbLocale?: string;
}): JsonTranslationFileOutcome {
  const sourceText = input.sourceText ?? `${JSON.stringify(input.source, null, 2)}\n`;
  return buildContentSyncJsonTranslationFile({
    source: Buffer.from(sourceText, "utf8"),
    existing:
      input.existingText !== undefined
        ? Buffer.from(input.existingText, "utf8")
        : input.existing === undefined
          ? null
          : Buffer.from(JSON.stringify(input.existing)),
    approved: input.approved,
    knownKeys: new Set(input.knownKeys ?? flatKeys(input.source ?? JSON.parse(sourceText))),
    droppedKeys: new Set(input.droppedKeys ?? []),
    hiddenKeys: new Set(input.hiddenKeys ?? []),
    ...(input.arbLocale ? { arbLocale: input.arbLocale } : {}),
  });
}

function text(outcome: JsonTranslationFileOutcome): string {
  if (outcome.kind !== "file") {
    throw new Error(`expected a file, got ${outcome.kind}`);
  }
  return outcome.content.toString("utf8");
}

function parsed(outcome: JsonTranslationFileOutcome): unknown {
  return JSON.parse(text(outcome));
}

describe("buildContentSyncJsonTranslationFile", () => {
  it("follows the source file's nesting and leaves out keys with no approved text", () => {
    const outcome = build({
      source: { title: "Home", nav: { about: "About", contact: "Contact" }, count: 3 },
      approved: { title: "Accueil", "nav.about": "À propos" },
    });
    expect(text(outcome)).toBe(
      `${JSON.stringify({ title: "Accueil", nav: { about: "À propos" }, count: 3 }, null, 2)}\n`,
    );
  });

  it("keeps what the repository's language file had: a key back in review, keys only it has, and its own settings", () => {
    const outcome = build({
      source: {
        title: "Home",
        intro: "Welcome",
        item_one: "item",
        item_other: "items",
        rtl: false,
      },
      existing: {
        title: "Accueil (old)",
        intro: "Bienvenue",
        item_one: "x",
        item_few: "y",
        item_many: "z",
        item_other: "w",
        rtl: true,
      },
      approved: { title: "Accueil" },
    });
    expect(parsed(outcome)).toEqual({
      title: "Accueil",
      intro: "Bienvenue",
      item_one: "x",
      item_other: "w",
      rtl: true,
      item_few: "y",
      item_many: "z",
    });
  });

  it("leaves out what the sync hid because the repository dropped it, inside kept sections too", () => {
    const outcome = build({
      source: { title: "Home" },
      existing: { title: "Vieux", gone: "Parti", legacy: { a: "A", b: "B", keep: "K" } },
      approved: { title: "Accueil" },
      droppedKeys: ["gone", "legacy.a", "legacy.b"],
    });
    expect(parsed(outcome)).toEqual({ title: "Accueil", legacy: { keep: "K" } });
  });

  it("is unchanged when no approved text lands where the file had something else", () => {
    expect(
      build({
        source: { title: "Home", intro: "Welcome" },
        existing: { title: "Accueil", intro: "Bienvenue" },
        approved: { title: "Accueil" },
      }),
    ).toEqual({ kind: "unchanged" });
    expect(build({ source: { a: "x" }, approved: {} })).toEqual({ kind: "unchanged" });
    // The only approved key sits in a list that waits, so the file would only be reformatted.
    expect(
      build({
        source: { steps: ["One", "Two"] },
        existingText: '{"steps":["Un","Deux"]}',
        approved: { "steps[0]": "Premier" },
        knownKeys: ["steps[0]", "steps[1]"],
      }).kind,
    ).toBe("file");
    expect(
      build({
        source: { steps: ["One", "Two", "Three"] },
        existingText: '{"steps":["Un","Deux"]}',
        approved: { "steps[0]": "Premier" },
      }),
    ).toEqual({ kind: "unchanged" });
  });

  it("copies strings the importer never keyed, and keys hidden by hand, as they are", () => {
    const outcome = build({
      source: { title: "Home", _context: "Landing page", icon: "", url: "https://x", code: "SKU" },
      existing: { code: "REF" },
      approved: { title: "Accueil" },
      knownKeys: ["title", "code"],
      hiddenKeys: ["code"],
    });
    expect(parsed(outcome)).toEqual({
      title: "Accueil",
      _context: "Landing page",
      icon: "",
      url: "https://x",
      code: "REF",
    });
  });

  it("leaves a list as the file has it until every item has text, and counts it", () => {
    const partial = build({
      source: { steps: ["One", "Two", "Three"], title: "T" },
      existing: { steps: ["Un", "Deux"] },
      approved: { "steps[0]": "Un", title: "Titre" },
    });
    expect(parsed(partial)).toEqual({ steps: ["Un", "Deux"], title: "Titre" });
    expect(partial.kind === "file" && partial.listsHeldBack).toBe(1);

    const complete = build({
      source: { steps: ["One", { label: "Two" }] },
      approved: { "steps[0]": "Un", "steps[1].label": "Deux" },
    });
    expect(parsed(complete)).toEqual({ steps: ["Un", { label: "Deux" }] });
  });

  it("swaps defaultMessage in a FormatJS catalog, keeps the other fields, and keeps a simple language file simple", () => {
    const source = {
      hello: { defaultMessage: "Hello", description: "Greeting" },
      bye: { defaultMessage: "Bye" },
    };
    const catalog = build({
      source,
      existing: { bye: { defaultMessage: "Au revoir" } },
      approved: { hello: "Bonjour" },
      knownKeys: ["hello", "bye"],
    });
    expect(parsed(catalog)).toEqual({
      hello: { defaultMessage: "Bonjour", description: "Greeting" },
      bye: { defaultMessage: "Au revoir" },
    });
    const simple = build({
      source,
      existing: { bye: "Au revoir" },
      approved: { hello: "Bonjour" },
      knownKeys: ["hello", "bye"],
    });
    expect(parsed(simple)).toEqual({ hello: "Bonjour", bye: "Au revoir" });
    expect(
      build({
        source,
        existing: { bye: [{ type: 0, value: "Au revoir" }] },
        approved: { hello: "Bonjour" },
        knownKeys: ["hello", "bye"],
      }),
    ).toEqual({ kind: "unreadable" });
  });

  it("names a Flutter ARB file's own locale", () => {
    const outcome = build({
      source: { "@@locale": "en", title: "Home", "@title": { description: "Page title" } },
      approved: { title: "Accueil" },
      knownKeys: ["title"],
      arbLocale: "fr",
    });
    expect(parsed(outcome)).toEqual({
      "@@locale": "fr",
      title: "Accueil",
      "@title": { description: "Page title" },
    });
  });

  it("writes with the existing file's indentation, byte-order mark and final newline, else the source's", () => {
    const fromExisting = build({
      source: null,
      sourceText: '{\n  "title": "Home"\n}\n',
      existingText: '﻿{\n\t"title": "Vieux"\n}',
      approved: { title: "Accueil" },
    });
    expect(text(fromExisting)).toBe('﻿{\n\t"title": "Accueil"\n}');
    const fromSource = build({
      source: null,
      sourceText: '{\n    "title": "Home"\n}',
      approved: { title: "Accueil" },
    });
    expect(text(fromSource)).toBe('{\n    "title": "Accueil"\n}');
  });

  it("gives up on a source or an existing file that is not a JSON object, and on a Lottie animation", () => {
    expect(build({ source: null, sourceText: "[1, 2]", approved: {} })).toEqual({
      kind: "unreadable",
    });
    expect(
      build({
        source: { title: "Home" },
        existingText: '{"title": "Vieux",}',
        approved: { title: "Accueil" },
      }),
    ).toEqual({ kind: "unreadable" });
    expect(
      build({
        source: { v: "5.7", layers: [{ t: { d: { k: [{ s: { t: "Hi" } }] } } }] },
        approved: {},
        knownKeys: [],
      }),
    ).toEqual({ kind: "unsupported" });
  });
});
