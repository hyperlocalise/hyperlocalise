/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { diffRevisionText } from "./content-editor-revision-diff";

describe("diffRevisionText", () => {
  it("marks the words that changed between two versions", () => {
    expect(diffRevisionText("Bonjour le monde", "Bonjour tout le monde")).toEqual([
      { kind: "same", text: "Bonjour " },
      { kind: "added", text: "tout " },
      { kind: "same", text: "le monde" },
    ]);
  });

  it("shows a replaced word as a removal then an addition", () => {
    expect(diffRevisionText("Salut", "Bonjour")).toEqual([
      { kind: "removed", text: "Salut" },
      { kind: "added", text: "Bonjour" },
    ]);
  });

  it("shows a first version as all added", () => {
    expect(diffRevisionText("", "Bonjour")).toEqual([{ kind: "added", text: "Bonjour" }]);
  });

  it("returns the text unchanged when both versions match", () => {
    expect(diffRevisionText("Bonjour", "Bonjour")).toEqual([{ kind: "same", text: "Bonjour" }]);
  });
});
