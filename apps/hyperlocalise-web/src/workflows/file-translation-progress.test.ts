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
  collectCompletedTranslationPageEntries,
  collectHtmlTranslationPageEntries,
  completedFileTranslationKeys,
  isFileTranslationCliHardFailure,
} from "./file-translation-progress";

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

  it("skips prefill-only keys that are missing from the output", () => {
    expect(
      collectCompletedTranslationPageEntries({
        keys: ["greeting", "workspace"],
        extracted: { greeting: "Bonjour" },
        prefills: { workspace: "Enable workspace knowledge" },
      }),
    ).toEqual({ greeting: "Bonjour" });
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
