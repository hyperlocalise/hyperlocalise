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

import { normalizeProviderGlossaryTermFlags } from "./normalize-provider-glossary-term";

describe("normalizeProviderGlossaryTermFlags", () => {
  it("marks Crowdin preferred terms as non-forbidden", () => {
    expect(normalizeProviderGlossaryTermFlags({ status: "preferred" })).toEqual({
      forbidden: false,
    });
  });

  it("marks Crowdin forbidden and not-recommended terms as forbidden", () => {
    expect(normalizeProviderGlossaryTermFlags({ status: "forbidden" })).toEqual({
      forbidden: true,
    });
    expect(normalizeProviderGlossaryTermFlags({ status: "not recommended" })).toEqual({
      forbidden: true,
    });
  });

  it("honors explicit Lokalise forbidden flags over status text", () => {
    expect(
      normalizeProviderGlossaryTermFlags({
        status: "preferred",
        forbidden: true,
      }),
    ).toEqual({ forbidden: true });
    expect(
      normalizeProviderGlossaryTermFlags({
        status: "forbidden",
        forbidden: false,
      }),
    ).toEqual({ forbidden: false });
  });

  it("defaults unknown statuses to non-forbidden preferred terms", () => {
    expect(normalizeProviderGlossaryTermFlags({ status: "observed" })).toEqual({
      forbidden: false,
    });
    expect(normalizeProviderGlossaryTermFlags({})).toEqual({ forbidden: false });
  });
});
