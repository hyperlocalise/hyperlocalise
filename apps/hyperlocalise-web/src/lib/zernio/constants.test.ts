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

import { buildZernioAuthorizationHeader, ZERNIO_API_BASE_URL } from "./constants";

describe("zernio constants", () => {
  it("builds the Zernio Bearer authorization header", () => {
    expect(buildZernioAuthorizationHeader("  sk_test_abc  ")).toBe("Bearer sk_test_abc");
  });

  it("points at the Zernio REST v1 base URL", () => {
    expect(ZERNIO_API_BASE_URL).toBe("https://zernio.com/api/v1");
  });
});
