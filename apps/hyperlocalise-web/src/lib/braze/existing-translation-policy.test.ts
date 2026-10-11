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

import { decideBrazeExistingTranslationAction } from "./existing-translation-policy";

describe("braze existing translation policy", () => {
  it("seeds only empty locales by default", () => {
    expect(
      decideBrazeExistingTranslationAction({
        policy: "seed_empty",
        presence: {
          hasExistingTranslation: true,
          importProvenanceOnly: true,
          contentHash: "old",
        },
        incomingHash: "new",
      }),
    ).toBe("skip");
    expect(
      decideBrazeExistingTranslationAction({
        policy: "seed_empty",
        presence: {
          hasExistingTranslation: false,
          importProvenanceOnly: false,
          contentHash: null,
        },
        incomingHash: "new",
      }),
    ).toBe("import");
  });

  it("refreshes only imported provenance when the remote hash changed", () => {
    expect(
      decideBrazeExistingTranslationAction({
        policy: "refresh_imported",
        presence: {
          hasExistingTranslation: true,
          importProvenanceOnly: true,
          contentHash: "old",
        },
        incomingHash: "new",
      }),
    ).toBe("import");
    expect(
      decideBrazeExistingTranslationAction({
        policy: "refresh_imported",
        presence: {
          hasExistingTranslation: true,
          importProvenanceOnly: false,
          contentHash: "old",
        },
        incomingHash: "new",
      }),
    ).toBe("skip");
  });
});
