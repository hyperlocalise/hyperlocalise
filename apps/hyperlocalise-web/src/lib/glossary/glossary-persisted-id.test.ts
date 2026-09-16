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

import { isQueryableNativeGlossaryId } from "./glossary-persisted-id";

describe("isQueryableNativeGlossaryId", () => {
  it("accepts persisted uuid glossaries and rejects live provider ids", () => {
    expect(isQueryableNativeGlossaryId("22222222-2222-4222-8222-222222222222")).toBe(true);
    expect(isQueryableNativeGlossaryId("crowdin:glossary:718785")).toBe(false);
    expect(isQueryableNativeGlossaryId("not-a-uuid")).toBe(false);
  });
});
