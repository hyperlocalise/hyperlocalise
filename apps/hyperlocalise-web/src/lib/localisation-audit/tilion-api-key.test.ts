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

import { resolveTilionApiKey, tilionApiKeyKind } from "./tilion-api-key";

describe("tilionApiKeyKind", () => {
  it("classifies live, test, other, and missing keys", () => {
    expect(tilionApiKeyKind("ph_live_abc")).toBe("ph_live");
    expect(tilionApiKeyKind("ph_test_abc")).toBe("ph_test");
    expect(tilionApiKeyKind("tl_key")).toBe("other");
    expect(tilionApiKeyKind("  ")).toBe("missing");
    expect(tilionApiKeyKind(undefined)).toBe("missing");
  });
});

describe("resolveTilionApiKey", () => {
  it("prefers process.env over t3-env and records both sources", () => {
    expect(
      resolveTilionApiKey({
        processValue: " ph_live_from_process ",
        t3EnvValue: "ph_live_from_env",
      }),
    ).toEqual({
      apiKey: "ph_live_from_process",
      processTilionApiKeyPresent: true,
      t3EnvTilionApiKeyPresent: true,
      tilionApiKeyKind: "ph_live",
      tilionApiKeySource: "process.env",
      tilionApiKeySourcesAgree: true,
    });
  });

  it("falls back to t3-env when process.env is empty", () => {
    expect(resolveTilionApiKey({ processValue: " ", t3EnvValue: "tl_key" })).toMatchObject({
      apiKey: "tl_key",
      processTilionApiKeyPresent: false,
      t3EnvTilionApiKeyPresent: true,
      tilionApiKeyKind: "other",
      tilionApiKeySource: "t3-env",
      tilionApiKeySourcesAgree: false,
    });
  });

  it("reports a missing key when neither source has a value", () => {
    expect(resolveTilionApiKey({ processValue: "", t3EnvValue: undefined })).toEqual({
      apiKey: undefined,
      processTilionApiKeyPresent: false,
      t3EnvTilionApiKeyPresent: false,
      tilionApiKeyKind: "missing",
      tilionApiKeySource: "missing",
      tilionApiKeySourcesAgree: true,
    });
  });
});
