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
  TMX_DEFAULT_BATCH_SIZE,
  TMX_DEFAULT_MAX_UNITS,
  TMX_MAX_IMPORT_CONTENT_CHARS,
} from "./tmx-constants";

describe("TMX import limits", () => {
  it("allows million-unit memories and hundred-megabyte payloads", () => {
    expect(TMX_DEFAULT_MAX_UNITS).toBe(1_000_000);
    expect(TMX_MAX_IMPORT_CONTENT_CHARS).toBe(100_000_000);
    expect(TMX_DEFAULT_BATCH_SIZE).toBe(500);
  });
});
