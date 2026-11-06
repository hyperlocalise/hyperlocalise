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

import { decideImportedSourceText } from "./project-translation-service";

describe("decideImportedSourceText", () => {
  const editable = { sourceTextEditable: true };

  it("takes the file's text whenever source text isn't editable in the platform", () => {
    expect(
      decideImportedSourceText({
        fileText: "Repo",
        platformText: "Edited here",
        lastImportedText: "Base",
        sourceTextEditable: false,
      }),
    ).toEqual({ text: "Repo", clash: false });
  });

  it("keeps a platform-only change and takes a file-only change", () => {
    expect(
      decideImportedSourceText({
        ...editable,
        fileText: "Base",
        platformText: "Edited here",
        lastImportedText: "Base",
      }),
    ).toEqual({ text: "Edited here", clash: false });
    expect(
      decideImportedSourceText({
        ...editable,
        fileText: "Repo v2",
        platformText: "Base",
        lastImportedText: "Base",
      }),
    ).toEqual({ text: "Repo v2", clash: false });
  });

  it("agrees when both sides changed to the same text and clashes when they differ", () => {
    expect(
      decideImportedSourceText({
        ...editable,
        fileText: "Same",
        platformText: "Same",
        lastImportedText: "Base",
      }),
    ).toEqual({ text: "Same", clash: false });
    expect(
      decideImportedSourceText({
        ...editable,
        fileText: "Repo",
        platformText: "Here",
        lastImportedText: "Base",
      }),
    ).toEqual({ text: "Here", clash: true });
  });

  it("uses the platform's text as the base for a key with no text last imported", () => {
    expect(
      decideImportedSourceText({
        ...editable,
        fileText: "Repo",
        platformText: "Here",
        lastImportedText: null,
      }),
    ).toEqual({ text: "Repo", clash: false });
  });

  it("compares texts exactly", () => {
    expect(
      decideImportedSourceText({
        ...editable,
        fileText: "Base ",
        platformText: "Here",
        lastImportedText: "Base",
      }),
    ).toEqual({ text: "Here", clash: true });
  });
});
