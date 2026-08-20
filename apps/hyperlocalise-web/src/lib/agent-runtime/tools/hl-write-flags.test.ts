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

import { isHlWriteFlagName } from "./hl-write-flags";

describe("isHlWriteFlagName", () => {
  it.each(["fix", "--fix", "--Fix", "--fix=true", "out-file", "--out-file=evil.json"])(
    "treats %s as a write flag",
    (token) => {
      expect(isHlWriteFlagName(token)).toBe(true);
    },
  );

  it.each(["--fix-dry-run", "format", "quiet", "json", "output"])(
    "does not treat %s as a write flag",
    (token) => {
      expect(isHlWriteFlagName(token)).toBe(false);
    },
  );
});
