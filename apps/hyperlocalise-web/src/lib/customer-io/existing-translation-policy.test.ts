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

import {
  customerIoTranslationPresence,
  decideCustomerIoExistingTranslationAction,
  isCustomerIoExistingTranslationPolicy,
} from "./existing-translation-policy";

describe("customer.io existing translation policy", () => {
  it("does not treat an unused import hash as existing work", () => {
    expect(
      customerIoTranslationPresence({ importedHash: undefined, translatedKeyCount: 0 }),
    ).toEqual({
      hasExistingTranslation: false,
      importProvenanceOnly: false,
      contentHash: null,
    });
    expect(
      customerIoTranslationPresence({
        importedHash: "old",
        translatedKeyCount: 1,
        provenances: ["translation_job", ""],
      }),
    ).toEqual({
      hasExistingTranslation: true,
      importProvenanceOnly: false,
      contentHash: "old",
    });
    expect(
      customerIoTranslationPresence({
        importedHash: "old",
        translatedKeyCount: 1,
        provenances: ["import", "import"],
      }).importProvenanceOnly,
    ).toBe(true);
    expect(isCustomerIoExistingTranslationPolicy("overwrite_all")).toBe(true);
    expect(isCustomerIoExistingTranslationPolicy("seed_if_empty")).toBe(false);
  });

  it("seeds only empty locales by default", () => {
    expect(
      decideCustomerIoExistingTranslationAction({
        policy: "seed_empty",
        presence: {
          hasExistingTranslation: false,
          importProvenanceOnly: false,
          contentHash: null,
        },
        incomingHash: "new",
      }),
    ).toBe("import");
    expect(
      decideCustomerIoExistingTranslationAction({
        policy: "seed_empty",
        presence: {
          hasExistingTranslation: true,
          importProvenanceOnly: true,
          contentHash: "old",
        },
        incomingHash: "new",
      }),
    ).toBe("skip");
  });

  it("refreshes only import-provenance copy when the remote hash changed", () => {
    expect(
      decideCustomerIoExistingTranslationAction({
        policy: "refresh_imported",
        presence: {
          hasExistingTranslation: false,
          importProvenanceOnly: false,
          contentHash: null,
        },
        incomingHash: "new",
      }),
    ).toBe("import");
    expect(
      decideCustomerIoExistingTranslationAction({
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
      decideCustomerIoExistingTranslationAction({
        policy: "refresh_imported",
        presence: {
          hasExistingTranslation: true,
          importProvenanceOnly: true,
          contentHash: "same",
        },
        incomingHash: "same",
      }),
    ).toBe("skip");
    expect(
      decideCustomerIoExistingTranslationAction({
        policy: "refresh_imported",
        presence: {
          hasExistingTranslation: true,
          importProvenanceOnly: false,
          contentHash: "old",
        },
        incomingHash: "new",
      }),
    ).toBe("skip");
    expect(
      decideCustomerIoExistingTranslationAction({
        policy: "refresh_imported",
        presence: {
          hasExistingTranslation: true,
          importProvenanceOnly: true,
          contentHash: null,
        },
        incomingHash: "new",
      }),
    ).toBe("skip");
  });

  it("overwrites every existing locale when the policy is overwrite_all", () => {
    expect(
      decideCustomerIoExistingTranslationAction({
        policy: "overwrite_all",
        presence: {
          hasExistingTranslation: true,
          importProvenanceOnly: false,
          contentHash: "human",
        },
        incomingHash: "human",
      }),
    ).toBe("import");
  });
});
