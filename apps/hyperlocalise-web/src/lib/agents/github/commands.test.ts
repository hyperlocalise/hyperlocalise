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

import { parseHyperlocaliseCommand } from "./commands";

describe("parseHyperlocaliseCommand", () => {
  it("returns null without a mention or extra instructions", () => {
    expect(parseHyperlocaliseCommand("please review")).toBeNull();
    expect(parseHyperlocaliseCommand("@hyperlocalise")).toBeNull();
    expect(parseHyperlocaliseCommand("@Hyperlocalise   ")).toBeNull();
  });

  it("parses review and ignores extra mention text", () => {
    expect(parseHyperlocaliseCommand("@hyperlocalise review")).toEqual({ command: "review" });
    expect(parseHyperlocaliseCommand("@Hyperlocalise review focus on ICU")).toEqual({
      command: "review",
    });
  });

  it("rejects fix and treats other text as repository instructions", () => {
    expect(parseHyperlocaliseCommand("@hyperlocalise fix vi")).toEqual({
      command: "unsupported_fix",
    });
    expect(parseHyperlocaliseCommand("@hyperlocalise sync repo translations")).toEqual({
      command: "repository",
      instructions: "sync repo translations",
    });
  });
});
