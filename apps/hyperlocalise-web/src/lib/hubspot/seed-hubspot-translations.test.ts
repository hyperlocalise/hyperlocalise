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

import { serializeHubspotDocument } from "./document";
import {
  hubspotDifferingEntries,
  hubspotSeedHash,
  hubspotSeedSourceKeys,
  isHubspotSeedComplete,
} from "./seed-hubspot-translations";

describe("hubspot seed helpers", () => {
  it("keeps only locale values that differ from the source", () => {
    expect(
      hubspotDifferingEntries(
        { title: "Hello", body: "World" },
        { title: "Bonjour", body: "World", extra: "Supplément" },
      ),
    ).toEqual({ title: "Bonjour" });
  });

  it("ignores blank locale values", () => {
    expect(hubspotDifferingEntries({ title: "Hello" }, { title: "  " })).toEqual({});
  });

  it("hashes entries independent of key order", () => {
    expect(hubspotSeedHash({ a: "1", b: "2" })).toBe(hubspotSeedHash({ b: "2", a: "1" }));
    expect(hubspotSeedHash({ a: "1" })).not.toBe(hubspotSeedHash({ a: "2" }));
  });

  it("requires every source key for a complete seed", () => {
    expect(isHubspotSeedComplete([], { a: "1" })).toBe(false);
    expect(isHubspotSeedComplete(["a", "b"], { a: "1" })).toBe(false);
    expect(isHubspotSeedComplete(["a", "b"], { a: "1", b: "2" })).toBe(true);
  });

  it("lists flattened keys of a stored JSON document", () => {
    const content = serializeHubspotDocument({ title: "Hello", nested: { body: "World" } });
    expect(hubspotSeedSourceKeys("form", content).toSorted()).toEqual(["nested.body", "title"]);
    expect(hubspotSeedSourceKeys("form", "not json")).toEqual([]);
  });
});
