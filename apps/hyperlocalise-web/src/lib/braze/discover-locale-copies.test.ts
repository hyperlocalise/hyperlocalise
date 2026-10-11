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
  brazeLibraryNeedsFullCopyScan,
  discoverBrazeLocaleCopies,
  mergeBrazeLocaleCopies,
  remainingBrazeJobLocales,
} from "./discover-locale-copies";
import { brazeEmailCopyName } from "./names";

describe("discoverBrazeLocaleCopies", () => {
  it("maps source names onto listed locale copies", () => {
    expect(
      discoverBrazeLocaleCopies({
        sourceName: "Welcome",
        suffixes: ["fr-FR", "de-DE"],
        library: [
          { id: "src", name: "Welcome" },
          { id: "fr", name: "Welcome_fr-FR" },
        ],
        copyName: brazeEmailCopyName,
      }),
    ).toEqual({
      localeCopyIds: { "fr-FR": "fr" },
      localeCopyNames: { "fr-FR": "Welcome_fr-FR" },
    });
  });

  it("lets persisted copy ids win over library discovery", () => {
    expect(
      mergeBrazeLocaleCopies(
        { localeCopyIds: { "fr-FR": "listed" }, localeCopyNames: { "fr-FR": "Welcome_fr-FR" } },
        { localeCopyIds: { "fr-FR": "stored" }, localeCopyNames: { "fr-FR": "Welcome_fr-FR" } },
      ),
    ).toEqual({
      localeCopyIds: { "fr-FR": "stored" },
      localeCopyNames: { "fr-FR": "Welcome_fr-FR" },
    });
  });

  it("asks for a full library scan when listed items omit a copy", () => {
    expect(
      brazeLibraryNeedsFullCopyScan({
        sourceNames: ["Welcome"],
        suffixes: ["fr-FR"],
        library: [{ id: "src", name: "Welcome" }],
        existingCopyIdsBySourceName: new Map(),
        copyName: brazeEmailCopyName,
      }),
    ).toBe(true);
    expect(
      brazeLibraryNeedsFullCopyScan({
        sourceNames: ["Welcome"],
        suffixes: ["fr-FR"],
        library: [
          { id: "src", name: "Welcome" },
          { id: "fr", name: "Welcome_fr-FR" },
        ],
        existingCopyIdsBySourceName: new Map(),
        copyName: brazeEmailCopyName,
      }),
    ).toBe(false);
  });

  it("drops imported and already-translated locales from generated jobs", () => {
    expect(
      remainingBrazeJobLocales({
        jobTargetLocales: ["fr-FR", "de-DE", "ja-JP"],
        brazeSuffixes: ["fr-FR", "de-DE", "ja-JP"],
        importedHashes: { "fr-FR": "abc" },
        skippedExistingSuffixes: ["de-DE"],
      }),
    ).toEqual(["ja-JP"]);
  });
});
