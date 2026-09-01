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

import { mediaLocalizationOperationKey } from "@/lib/billing/media-localization-operation-key";

describe("mediaLocalizationOperationKey", () => {
  it("appends a unique attempt id for every provider run", () => {
    const first = mediaLocalizationOperationKey("image-localization:variant:p:hero.png:fr");
    const second = mediaLocalizationOperationKey("image-localization:variant:p:hero.png:fr");
    expect(first).toMatch(/^image-localization:variant:p:hero\.png:fr:attempt:[0-9a-f-]{36}$/);
    expect(second).toMatch(/^image-localization:variant:p:hero\.png:fr:attempt:[0-9a-f-]{36}$/);
    expect(first).not.toBe(second);
  });
});
