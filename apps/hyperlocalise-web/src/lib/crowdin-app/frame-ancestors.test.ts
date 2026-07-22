/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_CROWDIN_APP_FRAME_ANCESTORS,
  buildCrowdinAppFrameAncestorsCsp,
  frameAncestorFromCrowdinBaseUrl,
  resolveCrowdinAppFrameAncestors,
} from "./frame-ancestors";

describe("resolveCrowdinAppFrameAncestors", () => {
  it("returns Crowdin SaaS defaults when env is empty", () => {
    expect(resolveCrowdinAppFrameAncestors()).toEqual([...DEFAULT_CROWDIN_APP_FRAME_ANCESTORS]);
  });

  it("merges custom Enterprise UI origins with defaults", () => {
    expect(
      resolveCrowdinAppFrameAncestors({
        envValue: "https://translate.acme.com, https://l10n.example.org",
      }),
    ).toEqual([
      ...DEFAULT_CROWDIN_APP_FRAME_ANCESTORS,
      "https://translate.acme.com",
      "https://l10n.example.org",
    ]);
  });

  it("includes install baseUrl origins without duplicating defaults", () => {
    expect(
      resolveCrowdinAppFrameAncestors({
        installBaseUrls: ["https://acme.crowdin.com", "https://crowdin.com/"],
      }),
    ).toEqual([...DEFAULT_CROWDIN_APP_FRAME_ANCESTORS, "https://acme.crowdin.com"]);
  });
});

describe("frameAncestorFromCrowdinBaseUrl", () => {
  it("normalizes to origin", () => {
    expect(frameAncestorFromCrowdinBaseUrl("https://acme.crowdin.com/api/v2")).toBe(
      "https://acme.crowdin.com",
    );
  });

  it("rejects invalid urls", () => {
    expect(frameAncestorFromCrowdinBaseUrl("not-a-url")).toBeNull();
  });
});

describe("buildCrowdinAppFrameAncestorsCsp", () => {
  it("builds a frame-ancestors directive", () => {
    expect(
      buildCrowdinAppFrameAncestorsCsp(["https://crowdin.com", "https://translate.acme.com"]),
    ).toBe("frame-ancestors https://crowdin.com https://translate.acme.com;");
  });
});
