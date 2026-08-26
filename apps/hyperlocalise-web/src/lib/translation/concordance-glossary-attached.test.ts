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

import { shouldIncludeAttachedGlossary } from "@/lib/glossary/glossary-concordance";

describe("shouldIncludeAttachedGlossary", () => {
  it("includes only native glossaries for native projects", () => {
    expect(shouldIncludeAttachedGlossary("native", { source: "native" } as never)).toBe(true);
    expect(shouldIncludeAttachedGlossary("native", { source: "external_tms" } as never)).toBe(
      false,
    );
  });

  it("includes native and crowdin glossaries for external projects", () => {
    expect(shouldIncludeAttachedGlossary("external_tms", { source: "native" } as never)).toBe(true);
    expect(
      shouldIncludeAttachedGlossary("external_tms", {
        source: "external_tms",
        externalProviderKind: "crowdin",
      } as never),
    ).toBe(true);
    expect(
      shouldIncludeAttachedGlossary("external_tms", {
        source: "external_tms",
        externalProviderKind: "lokalise",
      } as never),
    ).toBe(false);
  });
});
