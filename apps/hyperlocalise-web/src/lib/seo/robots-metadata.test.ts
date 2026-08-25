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

import { INDEXABLE_ROBOTS, PRIVATE_ROBOTS } from "./robots-metadata";

describe("robots metadata", () => {
  it("indexes public marketing routes", () => {
    expect(INDEXABLE_ROBOTS).toEqual({ index: true, follow: true });
  });

  it("keeps non-marketing routes out of search indexes by default", () => {
    expect(PRIVATE_ROBOTS).toEqual({ index: false, follow: false });
  });
});
