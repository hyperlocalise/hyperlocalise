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

import {
  normalizeProviderBaseUrl,
  normalizeProviderDownloadUrl,
} from "@/lib/providers/shared/provider-url-safety";

describe("provider URL safety", () => {
  it("normalizes safe HTTPS provider base URLs", () => {
    expect(
      normalizeProviderBaseUrl(
        "https://enterprise.crowdin.com/api/v2///?ignored=true#fragment",
        "https://api.crowdin.com/api/v2",
      ),
    ).toBe("https://enterprise.crowdin.com/api/v2");
  });

  it("rejects local and private provider base URLs", () => {
    for (const url of [
      "http://api.crowdin.com/api/v2",
      "https://localhost/api/v2",
      "https://127.0.0.1/api/v2",
      "https://10.0.0.7/api/v2",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/api/v2",
    ]) {
      expect(normalizeProviderBaseUrl(url, "https://api.crowdin.com/api/v2")).toBeNull();
    }
  });

  it("rejects unsafe download URLs while keeping signed public URLs intact", () => {
    expect(
      normalizeProviderDownloadUrl("https://files.example.test/download?token=signed#ignored"),
    ).toBe("https://files.example.test/download?token=signed");
    expect(normalizeProviderDownloadUrl("https://192.168.1.10/download")).toBeNull();
  });
});
