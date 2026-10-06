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
// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import { availablePersonasForFamily } from "./content-editor-workspace-persona-switcher-connected";

describe("availablePersonasForFamily", () => {
  it("offers translator and reviewer for text files", () => {
    expect(availablePersonasForFamily("text")).toEqual(["translator", "reviewer"]);
  });

  it("offers only designer for image, video, and office files", () => {
    expect(availablePersonasForFamily("image")).toEqual(["designer"]);
    expect(availablePersonasForFamily("video")).toEqual(["designer"]);
    expect(availablePersonasForFamily("office")).toEqual(["designer"]);
  });

  it("offers translator, designer, and reviewer for native markdown with segment views", () => {
    expect(availablePersonasForFamily("document", ["comfortable", "side-by-side", "file"])).toEqual(
      ["translator", "designer", "reviewer"],
    );
  });

  it("stays designer-only for document files without segment views", () => {
    expect(availablePersonasForFamily("document", ["file"])).toEqual(["designer"]);
    expect(availablePersonasForFamily("document")).toEqual(["designer"]);
  });
});
