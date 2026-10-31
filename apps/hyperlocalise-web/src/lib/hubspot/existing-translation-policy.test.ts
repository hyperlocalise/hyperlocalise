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
  decideHubspotExistingTranslationAction,
  decideHubspotPushLocaleAction,
  hubspotTranslationPresence,
  isHubspotExistingTranslationPolicy,
} from "./existing-translation-policy";

describe("hubspot existing translation policy", () => {
  it("recognizes the three supported policies", () => {
    expect(isHubspotExistingTranslationPolicy("seed_empty")).toBe(true);
    expect(isHubspotExistingTranslationPolicy("refresh_imported")).toBe(true);
    expect(isHubspotExistingTranslationPolicy("overwrite_all")).toBe(true);
    expect(isHubspotExistingTranslationPolicy("unknown")).toBe(false);
    expect(isHubspotExistingTranslationPolicy(undefined)).toBe(false);
  });

  it("detects import-only provenance for refresh decisions", () => {
    expect(hubspotTranslationPresence({ translatedKeyCount: 0 })).toEqual({
      hasExistingTranslation: false,
      importProvenanceOnly: false,
      contentHash: null,
    });
    expect(
      hubspotTranslationPresence({
        importedHash: "old",
        translatedKeyCount: 2,
        provenances: ["import"],
      }),
    ).toEqual({
      hasExistingTranslation: true,
      importProvenanceOnly: true,
      contentHash: "old",
    });
    expect(
      hubspotTranslationPresence({
        importedHash: "old",
        translatedKeyCount: 2,
        provenances: ["import", "translation_job"],
      }).importProvenanceOnly,
    ).toBe(false);
  });

  it("seeds empty locales and overwrites everything on demand", () => {
    const empty = hubspotTranslationPresence({ translatedKeyCount: 0 });
    expect(
      decideHubspotExistingTranslationAction({
        policy: "seed_empty",
        presence: empty,
        incomingHash: "new",
      }),
    ).toBe("import");
    expect(
      decideHubspotExistingTranslationAction({
        policy: "seed_empty",
        presence: hubspotTranslationPresence({ translatedKeyCount: 3 }),
        incomingHash: "new",
      }),
    ).toBe("skip");
    expect(
      decideHubspotExistingTranslationAction({
        policy: "overwrite_all",
        presence: empty,
        incomingHash: "new",
      }),
    ).toBe("import");
  });

  it("refreshes only import-provenance translations whose hash changed", () => {
    const unchanged = hubspotTranslationPresence({
      importedHash: "same",
      translatedKeyCount: 2,
      provenances: ["import"],
    });
    expect(
      decideHubspotExistingTranslationAction({
        policy: "refresh_imported",
        presence: unchanged,
        incomingHash: "same",
      }),
    ).toBe("skip");
    expect(
      decideHubspotExistingTranslationAction({
        policy: "refresh_imported",
        presence: unchanged,
        incomingHash: "changed",
      }),
    ).toBe("import");
    expect(
      decideHubspotExistingTranslationAction({
        policy: "refresh_imported",
        presence: hubspotTranslationPresence({
          importedHash: "same",
          translatedKeyCount: 2,
          provenances: ["translation_job"],
        }),
        incomingHash: "changed",
      }),
    ).toBe("skip");
  });

  it("pushes empty remotes and changed content under refresh", () => {
    expect(
      decideHubspotPushLocaleAction({ policy: "seed_empty", remoteEmpty: true, contentHash: "a" }),
    ).toBe("push");
    expect(
      decideHubspotPushLocaleAction({ policy: "seed_empty", remoteEmpty: false, contentHash: "a" }),
    ).toBe("skip");
    expect(
      decideHubspotPushLocaleAction({
        policy: "overwrite_all",
        remoteEmpty: false,
        contentHash: "a",
      }),
    ).toBe("push");
    expect(
      decideHubspotPushLocaleAction({
        policy: "refresh_imported",
        remoteEmpty: false,
        lastPushHash: "old",
        contentHash: "new",
      }),
    ).toBe("push");
    expect(
      decideHubspotPushLocaleAction({
        policy: "refresh_imported",
        remoteEmpty: false,
        lastPushHash: "same",
        contentHash: "same",
      }),
    ).toBe("skip");
  });
});
