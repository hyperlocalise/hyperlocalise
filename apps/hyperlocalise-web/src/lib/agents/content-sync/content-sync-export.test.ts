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
  buildContentSyncLocalePath,
  buildContentSyncLottiePushTarget,
  buildContentSyncPushCandidate,
  isContentSyncJsonCompatiblePath,
  isContentSyncLottieCompatiblePath,
  shouldExportContentSyncTranslations,
} from "./content-sync-export";

describe("content sync export", () => {
  it("accepts JSON-compatible sources and rejects structured formats", () => {
    expect(isContentSyncJsonCompatiblePath("locales/en.json")).toBe(true);
    expect(isContentSyncJsonCompatiblePath("messages.jsonc")).toBe(true);
    expect(isContentSyncJsonCompatiblePath("app_en.arb")).toBe(true);
    expect(isContentSyncJsonCompatiblePath("messages.yaml")).toBe(false);
    expect(isContentSyncJsonCompatiblePath("catalog.po")).toBe(false);
    expect(isContentSyncJsonCompatiblePath("copy.xliff")).toBe(false);
    expect(isContentSyncLottieCompatiblePath("animations/intro.lottie")).toBe(true);
    expect(isContentSyncLottieCompatiblePath("locales/messages.json")).toBe(false);
  });

  it("inserts the locale before the source extension", () => {
    expect(buildContentSyncLocalePath("locales/messages.json", "fr")).toBe(
      "locales/messages-fr.json",
    );
    expect(buildContentSyncLocalePath("messages", "de")).toBe("messages-de");
  });

  it("skips files with no ready translations", () => {
    expect(
      shouldExportContentSyncTranslations({
        translatedKeyCount: 0,
        prefilled: { greeting: "Hello" },
      }),
    ).toBe(false);
    expect(
      shouldExportContentSyncTranslations({
        translatedKeyCount: 2,
        prefilled: {},
      }),
    ).toBe(false);
    expect(
      shouldExportContentSyncTranslations({
        translatedKeyCount: 1,
        prefilled: { greeting: "Bonjour" },
      }),
    ).toBe(true);
  });

  it("builds a JSON candidate only for ready, JSON-compatible translations", () => {
    expect(
      buildContentSyncPushCandidate({
        providerPath: "locales/messages.yaml",
        locale: "fr",
        translatedKeyCount: 1,
        prefilled: { greeting: "Bonjour" },
      }),
    ).toBeNull();
    expect(
      buildContentSyncPushCandidate({
        providerPath: "locales/messages.json",
        locale: "fr",
        translatedKeyCount: 0,
        prefilled: { greeting: "Hello" },
      }),
    ).toBeNull();

    const candidate = buildContentSyncPushCandidate({
      providerPath: "locales/messages.json",
      locale: "fr",
      translatedKeyCount: 1,
      prefilled: { greeting: "Bonjour" },
    });
    expect(candidate?.targetPath).toBe("locales/messages-fr.json");
    expect(candidate?.content.toString("utf8")).toBe('{\n  "greeting": "Bonjour"\n}\n');
  });

  it("builds a dotLottie target path without JSON serialization", () => {
    expect(
      buildContentSyncLottiePushTarget({
        providerPath: "animations/intro.lottie",
        locale: "fr",
        translatedKeyCount: 0,
        prefilled: { greeting: "Hello" },
      }),
    ).toBeNull();

    const target = buildContentSyncLottiePushTarget({
      providerPath: "animations/intro.lottie",
      locale: "fr",
      translatedKeyCount: 1,
      prefilled: { "a/caption.json#layers[0].t.d.k[0].s.t": "Bonjour" },
    });
    expect(target).toEqual({ targetPath: "animations/intro-fr.lottie" });
    expect(
      buildContentSyncPushCandidate({
        providerPath: "animations/intro.lottie",
        locale: "fr",
        translatedKeyCount: 1,
        prefilled: { "a/caption.json#layers[0].t.d.k[0].s.t": "Bonjour" },
      }),
    ).toBeNull();
  });
});
