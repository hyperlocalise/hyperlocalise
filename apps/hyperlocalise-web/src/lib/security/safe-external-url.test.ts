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

import { sanitizeExternalUrl } from "./safe-external-url";

describe("sanitizeExternalUrl", () => {
  it("allows https URLs without credentials", () => {
    expect(sanitizeExternalUrl("https://crowdin.com/project/example")).toBe(
      "https://crowdin.com/project/example",
    );
  });

  it("rejects javascript URLs", () => {
    expect(sanitizeExternalUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects credentialed URLs", () => {
    expect(sanitizeExternalUrl("https://user:pass@example.test/project")).toBeNull();
  });
});
