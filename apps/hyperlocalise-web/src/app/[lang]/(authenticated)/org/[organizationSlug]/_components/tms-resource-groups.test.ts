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

import { groupByTmsProvider, tmsProviderTitle } from "./tms-resource-groups";

describe("tmsProviderTitle", () => {
  it("uses the TMS brand name", () => {
    expect(tmsProviderTitle("crowdin")).toBe("Crowdin");
    expect(tmsProviderTitle("phrase")).toBe("Phrase");
    expect(tmsProviderTitle("smartling")).toBe("Smartling");
    expect(tmsProviderTitle("lokalise")).toBe("Lokalise");
  });

  it("does not fall back to Hyperlocalise for an unknown TMS", () => {
    expect(tmsProviderTitle(null)).toBe("TMS");
    expect(tmsProviderTitle("unknown")).toBe("TMS");
  });
});

describe("groupByTmsProvider", () => {
  it("splits rows by TMS and keeps an empty connected group", () => {
    const groups = groupByTmsProvider({
      connectedKinds: ["crowdin"],
      items: [
        { id: "phrase-1", externalProviderKind: "phrase" },
        { id: "crowdin-1", externalProviderKind: "crowdin" },
      ],
    });

    expect(
      groups.map((group) => [group.id, group.title, group.items.map((item) => item.id)]),
    ).toEqual([
      ["crowdin", "Crowdin", ["crowdin-1"]],
      ["phrase", "Phrase", ["phrase-1"]],
    ]);
  });

  it("omits a nameless provider group when nothing is connected", () => {
    expect(
      groupByTmsProvider({
        connectedKinds: [],
        items: [],
      }),
    ).toEqual([]);
  });
});
