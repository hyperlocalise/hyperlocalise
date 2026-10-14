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

import { createHash } from "node:crypto";

import {
  collectCompletedTranslationPageEntries,
  collectHtmlTranslationPageEntries,
  completedFileTranslationKeys,
  isFileTranslationCliHardFailure,
  mergeCanvaJsonExtractedEntries,
  remapPrefillsOntoSourceKeys,
  resolveCollectedTranslationEntryValue,
  sourceKeysForLockCompletions,
} from "./file-translation-progress";

describe("resolveCollectedTranslationEntryValue", () => {
  const source = "Describe a Cat";

  it("prefers on-disk translation when hl entries still show source text", () => {
    expect(
      resolveCollectedTranslationEntryValue(source, "Mô tả một con mèo", "Describe a Cat"),
    ).toBe("Mô tả một con mèo");
  });

  it("keeps hl translation when the target file still contains source fallbacks", () => {
    expect(resolveCollectedTranslationEntryValue(source, "Describe a Cat", "描述一只猫")).toBe(
      "描述一只猫",
    );
  });

  it("prefers on-disk text when both sources disagree and only the file differs from source", () => {
    expect(resolveCollectedTranslationEntryValue(source, "Mô tả một con mèo", "Mô tả khác")).toBe(
      "Mô tả một con mèo",
    );
  });
});

describe("mergeCanvaJsonExtractedEntries", () => {
  it("merges per lock key using file vs hl reconciliation", () => {
    const key = "canva.t.2b52fdaa63b8822c";
    expect(
      mergeCanvaJsonExtractedEntries({
        keys: [key],
        sourceEntries: { [key]: "Describe a Cat" },
        fileExtracted: { [key]: "Mô tả một con mèo" },
        hlExtracted: { [key]: "Describe a Cat" },
      }),
    ).toEqual({ [key]: "Mô tả một con mèo" });
  });
});

describe("collectCompletedTranslationPageEntries", () => {
  it("keeps completed translations from the extracted output", () => {
    expect(
      collectCompletedTranslationPageEntries({
        keys: ["greeting"],
        extracted: { greeting: "Bonjour" },
        prefills: {},
      }),
    ).toEqual({ greeting: "Bonjour" });
  });

  it("keeps prefill-only keys that are missing from the output", () => {
    expect(
      collectCompletedTranslationPageEntries({
        keys: ["greeting", "workspace"],
        extracted: { greeting: "Bonjour" },
        prefills: { workspace: "Activer l'espace de travail" },
      }),
    ).toEqual({
      greeting: "Bonjour",
      workspace: "Activer l'espace de travail",
    });
  });

  it("throws when a lockfile-completed key is missing from the output", () => {
    expect(() =>
      collectCompletedTranslationPageEntries({
        keys: ["greeting"],
        extracted: {},
        prefills: {},
      }),
    ).toThrow("completed translation is missing from output");
  });
});

describe("collectHtmlTranslationPageEntries", () => {
  it("matches HTML target text onto source tag-path keys", () => {
    expect(
      collectHtmlTranslationPageEntries({
        sourceEntries: {
          "html.p": "This page tests ",
          "html.p.strong": "tables",
          "html.p.strong.2": "bullet lists",
        },
        extracted: {
          "html.p": "Cette page teste ",
          "html.p.strong": "les tableaux",
          "html.p.strong.2": "les listes à puces",
          "html.143b270a32602d41": "ignored hashed key",
        },
        confirmed: {},
        completedPathKeys: ["html.p", "html.p.strong", "html.p.strong.2"],
      }),
    ).toEqual({
      "html.p": "Cette page teste ",
      "html.p.strong": "les tableaux",
      "html.p.strong.2": "les listes à puces",
    });
  });

  it("skips already confirmed HTML path keys", () => {
    expect(
      collectHtmlTranslationPageEntries({
        sourceEntries: {
          "html.p": "This page tests ",
          "html.p.strong": "tables",
        },
        extracted: {
          "html.p": "Cette page teste ",
          "html.p.strong": "les tableaux",
        },
        confirmed: { "html.p": "Cette page teste " },
        completedPathKeys: ["html.p", "html.p.strong"],
      }),
    ).toEqual({
      "html.p.strong": "les tableaux",
    });
  });

  it("ignores source fallbacks that the lock did not complete", () => {
    expect(
      collectHtmlTranslationPageEntries({
        sourceEntries: {
          "html.p": "This page tests ",
          "html.p.strong": "tables",
          "html.body.p": "English leftover",
        },
        extracted: {
          "html.p": "Cette page teste ",
          "html.p.strong": "les tableaux",
          "html.body.p": "English leftover",
        },
        confirmed: {},
        completedPathKeys: ["html.p", "html.p.strong"],
      }),
    ).toEqual({
      "html.p": "Cette page teste ",
      "html.p.strong": "les tableaux",
    });
  });

  it("does not attach a later paragraph's lock to the first sibling path", () => {
    expect(
      collectHtmlTranslationPageEntries({
        sourceEntries: {
          "html.p": "Welcome",
          "html.p.2": "Click ",
          "html.p.strong": "here",
          "html.p.3": " now.",
        },
        extracted: {
          "html.p": "Welcome",
          "html.p.2": "Cliquez ",
          "html.p.strong": "ici",
          "html.p.3": " maintenant.",
        },
        confirmed: {},
        completedPathKeys: ["html.p.2", "html.p.strong", "html.p.3"],
      }),
    ).toEqual({
      "html.p.2": "Cliquez ",
      "html.p.strong": "ici",
      "html.p.3": " maintenant.",
    });
  });

  it("skips blank source text, whitespace-only extracts, and empty lock completions", () => {
    expect(
      collectHtmlTranslationPageEntries({
        sourceEntries: {
          "html.p": "Hello",
          "html.p.strong": "   ",
          "html.p.2": "World",
        },
        extracted: {
          "html.p": "   ",
          "html.p.strong": "monde",
          "html.p.2": "Monde",
        },
        confirmed: { "html.p.2": "" },
        completedPathKeys: ["html.p", "html.p.strong", "html.p.2"],
      }),
    ).toEqual({});
    expect(
      collectHtmlTranslationPageEntries({
        sourceEntries: { "html.p": "Hello" },
        extracted: { "html.p": "Bonjour" },
        confirmed: {},
        completedPathKeys: [],
      }),
    ).toEqual({});
  });
});

describe("isFileTranslationCliHardFailure", () => {
  it("treats a mixed success report as progress when hl reports task failures", () => {
    expect(
      isFileTranslationCliHardFailure(
        { succeeded: 99, failed: 1 },
        1,
        "run completed with failures: 1",
      ),
    ).toBe(false);
  });

  it("fails the step when hl exits after a write or lock error despite successes", () => {
    expect(
      isFileTranslationCliHardFailure(
        { succeeded: 99, failed: 0 },
        1,
        "flush outputs: write /tmp/out.json: disk full",
      ),
    ).toBe(true);
  });

  it("fails the step when every attempted key failed", () => {
    expect(
      isFileTranslationCliHardFailure(
        { succeeded: 0, failed: 1 },
        1,
        "run completed with failures: 1",
      ),
    ).toBe(true);
  });

  it("fails the step when hl exits non-zero without any successes", () => {
    expect(isFileTranslationCliHardFailure({ succeeded: 0, failed: 0 }, 1)).toBe(true);
  });

  it("accepts a fully successful report", () => {
    expect(isFileTranslationCliHardFailure({ succeeded: 10, failed: 0 }, 0)).toBe(false);
  });

  it("fails when the CLI exits 0 but reported only failures", () => {
    expect(isFileTranslationCliHardFailure({ succeeded: 0, failed: 3 }, 0)).toBe(true);
  });

  it("treats mixed success as progress when the CLI exits 0", () => {
    expect(isFileTranslationCliHardFailure({ succeeded: 2, failed: 1 }, 0)).toBe(false);
  });
});

describe("completedFileTranslationKeys", () => {
  it("reads keys for an exact output filename", () => {
    expect(
      completedFileTranslationKeys(
        {
          run_completed: {
            "fr.json": {
              greeting: { s: "Hello", t: "Bonjour" },
              farewell: { s: "Bye", t: "Au revoir" },
            },
          },
        },
        "fr.json",
      ),
    ).toEqual(["greeting", "farewell"]);
  });

  it("matches a basename when the lock stores a relative sandbox path", () => {
    expect(
      completedFileTranslationKeys(
        {
          run_completed: {
            "./locales/de.json": {
              greeting: { s: "Hello", t: "Hallo" },
            },
          },
        },
        "de.json",
      ),
    ).toEqual(["greeting"]);
  });

  it("matches a nested sandbox path by filename suffix", () => {
    expect(
      completedFileTranslationKeys(
        {
          run_completed: {
            "sandbox/out/locales/de.json": {
              greeting: { s: "Hello", t: "Hallo" },
            },
            "fr.json": {
              other: { s: "Other", t: "Autre" },
            },
          },
        },
        "de.json",
      ),
    ).toEqual(["greeting"]);
  });

  it("returns no keys when the lock has no matching completed path", () => {
    expect(completedFileTranslationKeys({ run_completed: {} }, "fr.json")).toEqual([]);
    expect(completedFileTranslationKeys({}, "fr.json")).toEqual([]);
  });

  it("rejects a malformed lock so resume cannot invent completed keys", () => {
    expect(() => completedFileTranslationKeys("not-a-lock", "fr.json")).toThrow();
    expect(() =>
      completedFileTranslationKeys(
        { run_completed: { "fr.json": { greeting: { s: "Hello" } } } },
        "fr.json",
      ),
    ).toThrow();
  });
});

describe("sourceKeysForLockCompletions", () => {
  it("keeps matching keys and every stamp that shares their source text", () => {
    expect(
      sourceKeysForLockCompletions(
        {
          "figma.k.a": "Project title",
          "figma.k.b": "Project title",
          "figma.k.c": "Other",
        },
        ["figma.k.b"],
      ).sort(),
    ).toEqual(["figma.k.a", "figma.k.b"]);
  });

  it("maps a content-hash lock key onto Figma stamp keys", () => {
    const source = "Project title";
    const hash = createHash("sha256").update(source, "utf8").digest("hex").slice(0, 16);
    expect(
      sourceKeysForLockCompletions(
        {
          "figma.k.a": source,
          "figma.k.b": source,
        },
        [`json.${hash}`],
      ).sort(),
    ).toEqual(["figma.k.a", "figma.k.b"]);
  });
});

describe("remapPrefillsOntoSourceKeys", () => {
  it("copies a translation onto stamp keys that share source text", () => {
    expect(
      remapPrefillsOntoSourceKeys(
        {
          "figma.k.a": "Project title",
          "figma.k.b": "Project title",
        },
        { "figma.k.b": "プロジェクトタイトル" },
      ),
    ).toEqual({
      "figma.k.a": "プロジェクトタイトル",
      "figma.k.b": "プロジェクトタイトル",
    });
  });
});
