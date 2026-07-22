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
import { describe, expect, it, vi } from "vite-plus/test";

import { getIntlShape } from "@/lib/app-i18n/intl";

import { fetchCatSegmentValidation } from "./project-file-cat-validation";

const testIntl = getIntlShape("en");

describe("fetchCatSegmentValidation", () => {
  it("returns no checks while go-svc validation is disabled", async () => {
    const fetcher = vi.fn();

    const result = await fetchCatSegmentValidation(
      {
        sourceText: "Hello {name}",
        targetText: "Bonjour {name}",
        sourcePath: "/messages/en.json",
        maxLength: 40,
        intl: testIntl,
      },
      fetcher,
    );

    expect(result).toEqual({
      ok: true,
      value: [],
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
