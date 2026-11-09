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
  isTranslationOrigin,
  nextTranslationOrigin,
  translationOriginWriterForProvenance,
} from "./translation-origin-rule";

describe("nextTranslationOrigin", () => {
  it.each([
    ["machine into empty", null, "machine", "Bonjour", "machine"],
    ["machine over human", { origin: "human", text: "Salut" }, "machine", "Bonjour", "machine"],
    [
      "person keeps machine text",
      { origin: "machine", text: "Bonjour" },
      "person",
      "Bonjour",
      "machine",
    ],
    [
      "person edits machine text",
      { origin: "machine", text: "Bonjour" },
      "person",
      "Salut",
      "machine_post_edited",
    ],
    [
      "person edits post-edited text",
      { origin: "machine_post_edited", text: "Salut" },
      "person",
      "Coucou",
      "machine_post_edited",
    ],
    ["person writes into empty", null, "person", "Salut", "human"],
    [
      "person edits unknown text",
      { origin: "unknown", text: "Salut" },
      "person",
      "Coucou",
      "human",
    ],
    [
      "person keeps unknown text",
      { origin: "unknown", text: "Salut" },
      "person",
      "Salut",
      "unknown",
    ],
    ["import into empty", null, "import", "Salut", "unknown"],
    [
      "import changes machine text",
      { origin: "machine", text: "Bonjour" },
      "import",
      "Salut",
      "unknown",
    ],
    [
      "import keeps machine text",
      { origin: "machine", text: "Bonjour" },
      "import",
      "Bonjour",
      "machine",
    ],
  ] as const)("%s", (_name, previous, writer, text, expected) => {
    expect(nextTranslationOrigin(previous, writer, text)).toBe(expected);
  });
});

describe("translationOriginWriterForProvenance", () => {
  it("maps each provenance to its writer", () => {
    expect(translationOriginWriterForProvenance("translation_job")).toBe("machine");
    expect(translationOriginWriterForProvenance("agent")).toBe("machine");
    expect(translationOriginWriterForProvenance("import")).toBe("import");
    expect(translationOriginWriterForProvenance("manual")).toBe("person");
  });
});

describe("isTranslationOrigin", () => {
  it("accepts only origin values", () => {
    expect(isTranslationOrigin("machine_post_edited")).toBe(true);
    expect(isTranslationOrigin("translation_job")).toBe(false);
    expect(isTranslationOrigin(undefined)).toBe(false);
  });
});
