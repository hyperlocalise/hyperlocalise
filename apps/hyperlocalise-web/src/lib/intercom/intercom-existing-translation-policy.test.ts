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

import { decideIntercomExistingTranslationAction } from "./intercom-existing-translation-policy";

const incomingHash = "incoming-hash";

describe("decideIntercomExistingTranslationAction", () => {
  it("seeds only empty locales by default", () => {
    expect(
      decideIntercomExistingTranslationAction({
        policy: "seed_empty",
        presence: {
          pushReady: false,
          hasExistingTranslation: false,
          importProvenanceOnly: false,
          contentHash: null,
        },
        incomingHash,
      }),
    ).toBe("import");
    expect(
      decideIntercomExistingTranslationAction({
        policy: "seed_empty",
        presence: {
          pushReady: true,
          hasExistingTranslation: true,
          importProvenanceOnly: true,
          contentHash: "old",
        },
        incomingHash,
      }),
    ).toBe("skip");
  });

  it("never clobbers unfinished or human work under seed_empty", () => {
    expect(
      decideIntercomExistingTranslationAction({
        policy: "seed_empty",
        presence: {
          pushReady: true,
          hasExistingTranslation: true,
          importProvenanceOnly: false,
          contentHash: "human",
        },
        incomingHash,
      }),
    ).toBe("skip");
    expect(
      decideIntercomExistingTranslationAction({
        policy: "seed_empty",
        presence: {
          pushReady: false,
          hasExistingTranslation: true,
          importProvenanceOnly: false,
          contentHash: null,
        },
        incomingHash,
      }),
    ).toBe("skip");
  });

  it("refreshes import-only copy when the Intercom hash changed", () => {
    expect(
      decideIntercomExistingTranslationAction({
        policy: "refresh_imported",
        presence: {
          pushReady: true,
          hasExistingTranslation: true,
          importProvenanceOnly: true,
          contentHash: "old",
        },
        incomingHash,
      }),
    ).toBe("import");
    expect(
      decideIntercomExistingTranslationAction({
        policy: "refresh_imported",
        presence: {
          pushReady: true,
          hasExistingTranslation: true,
          importProvenanceOnly: true,
          contentHash: incomingHash,
        },
        incomingHash,
      }),
    ).toBe("skip");
    expect(
      decideIntercomExistingTranslationAction({
        policy: "refresh_imported",
        presence: {
          pushReady: true,
          hasExistingTranslation: true,
          importProvenanceOnly: false,
          contentHash: "old",
        },
        incomingHash,
      }),
    ).toBe("skip");
    expect(
      decideIntercomExistingTranslationAction({
        policy: "refresh_imported",
        presence: {
          pushReady: false,
          hasExistingTranslation: false,
          importProvenanceOnly: false,
          contentHash: null,
        },
        incomingHash,
      }),
    ).toBe("import");
  });

  it("always replaces Hyperlocalise copy when overwrite_all is selected", () => {
    expect(
      decideIntercomExistingTranslationAction({
        policy: "overwrite_all",
        presence: {
          pushReady: true,
          hasExistingTranslation: true,
          importProvenanceOnly: false,
          contentHash: "human",
        },
        incomingHash,
      }),
    ).toBe("import");
  });
});
