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
import "dotenv/config";

import { describe, expect, it } from "vite-plus/test";

import { planImportActions } from "./import-memory-entries";
import type { MemoryImportCandidate } from "./tmx/tmx-types";

function candidate(
  overrides: Partial<MemoryImportCandidate> &
    Pick<MemoryImportCandidate, "sourceText" | "targetText" | "externalKey">,
): MemoryImportCandidate {
  return {
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    matchScore: 100,
    metadata: {},
    unitIndex: 0,
    isVariant: false,
    ...overrides,
  };
}

describe("planImportActions", () => {
  it("skips a duplicate tuid that appears twice before either create is persisted", () => {
    const first = candidate({
      sourceText: "Hello",
      targetText: "Bonjour",
      externalKey: "tmx:dup-1:en-US:fr-FR",
      unitIndex: 0,
      tuid: "dup-1",
    });
    const second = candidate({
      sourceText: "Hello again",
      targetText: "Bonjour encore",
      externalKey: "tmx:dup-1:en-US:fr-FR",
      unitIndex: 1,
      tuid: "dup-1",
    });

    const planned = planImportActions([first, second], new Map(), new Map());

    expect(planned.map((item) => item.action)).toEqual(["create", "skip"]);
  });

  it("updates when the external key already exists in memory", () => {
    const next = candidate({
      sourceText: "Hello",
      targetText: "Salut",
      externalKey: "tmx:existing-1:en-US:fr-FR",
      tuid: "existing-1",
    });
    const existingByExternalKey = new Map([
      ["tmx:existing-1:en-US:fr-FR", { id: "entry-1", externalKey: "tmx:existing-1:en-US:fr-FR" }],
    ]);

    const planned = planImportActions([next], existingByExternalKey, new Map());

    expect(planned).toEqual([{ candidate: next, action: "update", existingId: "entry-1" }]);
  });

  it("attaches an external key onto a source-matched row that lacked one", () => {
    const next = candidate({
      sourceText: "Hello",
      targetText: "Bonjour",
      externalKey: "tmx:attach-1:en-US:fr-FR",
      tuid: "attach-1",
    });
    // Matches sourceKey() → normalizeTranslationMemorySourceText("Hello") → "hello"
    const sourceKey = "en-US\u0000fr-FR\u0000hello";
    const existingBySourceKey = new Map([[sourceKey, { id: "entry-2", externalKey: null }]]);

    const planned = planImportActions([next], new Map(), existingBySourceKey);

    expect(planned).toEqual([{ candidate: next, action: "update", existingId: "entry-2" }]);
  });

  it("skips a source duplicate that already has an external key", () => {
    const next = candidate({
      sourceText: "Hello",
      targetText: "Bonjour",
      externalKey: null,
    });
    const sourceKey = "en-US\u0000fr-FR\u0000hello";
    const existingBySourceKey = new Map([
      [sourceKey, { id: "entry-3", externalKey: "tmx:other:en-US:fr-FR" }],
    ]);

    const planned = planImportActions([next], new Map(), existingBySourceKey);

    expect(planned.map((item) => item.action)).toEqual(["skip"]);
  });

  it("marks variant candidates as variant creates", () => {
    const next = candidate({
      sourceText: "Hello",
      targetText: "Bonjour alt",
      externalKey: "tmx:var-1:en-US:fr-FR",
      isVariant: true,
      tuid: "var-1",
    });

    const planned = planImportActions([next], new Map(), new Map());

    expect(planned.map((item) => item.action)).toEqual(["variant"]);
  });
});
