/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_NATIVE_REDIRECT_URI,
  getAllowedNativeRedirectUris,
  isAllowedNativeRedirectUri,
} from "./native-redirect";

describe("native-redirect", () => {
  it("always allows the default custom scheme", () => {
    expect(DEFAULT_NATIVE_REDIRECT_URI).toBe("hyperlocalise://auth/callback");
    expect(getAllowedNativeRedirectUris()).toContain("hyperlocalise://auth/callback");
    expect(isAllowedNativeRedirectUri("hyperlocalise://auth/callback")).toBe(true);
    expect(isAllowedNativeRedirectUri("https://evil.example/callback")).toBe(false);
    expect(isAllowedNativeRedirectUri("")).toBe(false);
  });
});
