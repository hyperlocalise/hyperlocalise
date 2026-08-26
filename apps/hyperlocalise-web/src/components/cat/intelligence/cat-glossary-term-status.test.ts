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

import { normalizedCatGlossaryTermStatus } from "./cat-glossary-term-status";

describe("normalizedCatGlossaryTermStatus", () => {
  it("maps explicit forbidden flags for status-less flat terms", () => {
    expect(
      normalizedCatGlossaryTermStatus({
        id: "term-1",
        locale: "fr",
        text: "Review",
        forbidden: true,
      }),
    ).toBe("not_recommended");
  });

  it("prefers status text when present", () => {
    expect(
      normalizedCatGlossaryTermStatus({
        id: "term-2",
        locale: "fr",
        text: "Enregistrer",
        status: "admitted",
      }),
    ).toBe("admitted");
  });
});
