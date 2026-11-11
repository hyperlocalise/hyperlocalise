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
  decideIterableExistingTranslationAction,
  decideIterablePushLocaleAction,
  isIterableExistingTranslationPolicy,
  iterableTranslationPresence,
} from "./existing-translation-policy";

describe("iterable existing translation policy", () => {
  it("does not treat an unused import hash as existing work", () => {
    expect(iterableTranslationPresence({ importedHash: undefined, translatedKeyCount: 0 })).toEqual(
      {
        hasExistingTranslation: false,
        importProvenanceOnly: false,
        contentHash: null,
      },
    );
    expect(
      iterableTranslationPresence({
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
      iterableTranslationPresence({
        importedHash: "old",
        translatedKeyCount: 1,
        provenances: ["import", "import"],
      }).importProvenanceOnly,
    ).toBe(true);
    expect(isIterableExistingTranslationPolicy("overwrite_all")).toBe(true);
    expect(isIterableExistingTranslationPolicy("seed_if_empty")).toBe(false);
  });

  it("seeds only empty locales by default", () => {
    expect(
      decideIterableExistingTranslationAction({
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
      decideIterableExistingTranslationAction({
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
      decideIterableExistingTranslationAction({
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
      decideIterableExistingTranslationAction({
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
      decideIterableExistingTranslationAction({
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
      decideIterableExistingTranslationAction({
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
      decideIterableExistingTranslationAction({
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
      decideIterableExistingTranslationAction({
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

describe("decideIterablePushLocaleAction", () => {
  it("pushes empty remotes under seed_empty and skips populated ones", () => {
    expect(
      decideIterablePushLocaleAction({
        policy: "seed_empty",
        remoteEmpty: true,
        contentHash: "new",
      }),
    ).toBe("push");
    expect(
      decideIterablePushLocaleAction({
        policy: "seed_empty",
        remoteEmpty: false,
        lastPushHash: "old",
        contentHash: "new",
      }),
    ).toBe("skip");
  });

  it("refreshes only locales this automation already pushed when the hash changed", () => {
    expect(
      decideIterablePushLocaleAction({
        policy: "refresh_imported",
        remoteEmpty: true,
        contentHash: "new",
      }),
    ).toBe("skip");
    expect(
      decideIterablePushLocaleAction({
        policy: "refresh_imported",
        remoteEmpty: false,
        lastPushHash: "old",
        contentHash: "new",
      }),
    ).toBe("push");
    expect(
      decideIterablePushLocaleAction({
        policy: "refresh_imported",
        remoteEmpty: false,
        lastPushHash: "same",
        contentHash: "same",
      }),
    ).toBe("skip");
  });

  it("pushes every locale when the policy is overwrite_all", () => {
    expect(
      decideIterablePushLocaleAction({
        policy: "overwrite_all",
        remoteEmpty: false,
        lastPushHash: "same",
        contentHash: "same",
      }),
    ).toBe("push");
  });
});
