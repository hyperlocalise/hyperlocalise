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
  });
}

function text(outcome: JsonTranslationFileOutcome): string {
  if (outcome.kind !== "file") {
    throw new Error(`expected a file, got ${outcome.kind}`);
  }
  return outcome.content.toString("utf8");
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
    expect(JSON.parse(text(outcome))).toEqual({
      title: "Accueil",
      intro: "Bienvenue",
      item_one: "x",
      item_other: "w",
      rtl: true,
      item_few: "y",
      item_many: "z",
    });
  });

  it("leaves out a key only the language file has when the sync hid it", () => {
    const outcome = build({
      source: { title: "Home" },
      existing: { title: "Vieux", gone: "Parti" },
      approved: { title: "Accueil" },
      droppedKeys: ["gone"],
    });
    expect(JSON.parse(text(outcome))).toEqual({ title: "Accueil" });
  });

  it("is unchanged when every approved text already matches the file, or nothing is approved", () => {
    expect(
      build({
        source: { title: "Home", intro: "Welcome" },
        existing: { title: "Accueil", intro: "Bienvenue" },
        approved: { title: "Accueil" },
      }),
    ).toEqual({ kind: "unchanged" });
    expect(build({ source: { a: "x" }, approved: {} })).toEqual({ kind: "unchanged" });
  });

  it("copies strings the importer never keyed, such as context fields and empty text", () => {
    const outcome = build({
      source: { title: "Home", _context: "Landing page", icon: "", url: "https://x" },
      approved: { title: "Accueil" },
      knownKeys: ["title"],
    });
    expect(JSON.parse(text(outcome))).toEqual({
      title: "Accueil",
      _context: "Landing page",
      icon: "",
      url: "https://x",
    });
  });

  it("holds a list back until every item has text, and counts it", () => {
    const partial = build({
      source: { steps: ["One", "Two"], title: "T" },
      approved: { "steps[0]": "Un", title: "Titre" },
    });
    expect(partial.kind).toBe("file");
    expect(JSON.parse(text(partial))).toEqual({ title: "Titre" });
    expect(partial.kind === "file" && partial.listsHeldBack).toBe(1);

    const complete = build({
      source: { steps: ["One", { label: "Two" }] },
      approved: { "steps[0]": "Un", "steps[1].label": "Deux" },
    });
    expect(JSON.parse(text(complete))).toEqual({ steps: ["Un", { label: "Deux" }] });
  });

  it("swaps defaultMessage in a FormatJS catalog, keeps the other fields and reads a simple language file", () => {
    const outcome = build({
      source: {
        hello: { defaultMessage: "Hello", description: "Greeting" },
        bye: { defaultMessage: "Bye" },
      },
      existing: { bye: "Au revoir" },
      approved: { hello: "Bonjour" },
      knownKeys: ["hello", "bye"],
    });
    expect(JSON.parse(text(outcome))).toEqual({
      hello: { defaultMessage: "Bonjour", description: "Greeting" },
      bye: { defaultMessage: "Au revoir" },
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
