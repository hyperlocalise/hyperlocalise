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

import { getNotFoundCopy, NOT_FOUND_STATUS_CODE } from "@/components/not-found/not-found-copy";
import { getIntlShape } from "@/lib/app-i18n/intl";

describe("getNotFoundCopy", () => {
  it("returns English 404 copy for the default locale", () => {
    const copy = getNotFoundCopy(getIntlShape("en"));

    expect(copy.statusCode).toBe(NOT_FOUND_STATUS_CODE);
    expect(copy.title).toBe("Page not found");
    expect(copy.documentTitle).toBe("Page not found | Hyperlocalise");
    expect(copy.homeLabel).toBe("Back to homepage");
    expect(copy.dashboardLabel).toBe("Go to dashboard");
    expect(copy.supportLabel).toBe("Contact support");
  });
});
