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

import { APP_LOCALE_HEADER_NAME } from "./locales";
import { resolveAppLocaleFromHeaders } from "./server-locale";
import { REQUEST_URL_HEADER } from "@/lib/workos/request-url-header";

function headersFromRecord(record: Record<string, string>): Headers {
  return new Headers(record);
}

describe("resolveAppLocaleFromHeaders", () => {
  it("prefers the locale header set by proxy", () => {
    const locale = resolveAppLocaleFromHeaders(
      headersFromRecord({
        [APP_LOCALE_HEADER_NAME]: "fr-FR",
        [REQUEST_URL_HEADER]: "https://www.hyperlocalise.com/en/pricing",
      }),
      "de-DE",
    );

    expect(locale).toBe("fr-FR");
  });

  it("falls back to the locale prefix in the forwarded request URL", () => {
    const locale = resolveAppLocaleFromHeaders(
      headersFromRecord({
        [REQUEST_URL_HEADER]: "https://www.hyperlocalise.com/zh-CN/blog",
      }),
      "en",
    );

    expect(locale).toBe("zh-CN");
  });

  it("uses the locale cookie when headers do not include a locale", () => {
    const locale = resolveAppLocaleFromHeaders(headersFromRecord({}), "vi-VN");

    expect(locale).toBe("vi-VN");
  });

  it("defaults to English when no locale signals are present", () => {
    const locale = resolveAppLocaleFromHeaders(headersFromRecord({}), undefined);

    expect(locale).toBe("en");
  });

  it("ignores invalid cookie values", () => {
    const locale = resolveAppLocaleFromHeaders(
      headersFromRecord({
        [REQUEST_URL_HEADER]: "https://www.hyperlocalise.com/de-DE/company",
      }),
      "not-a-locale",
    );

    expect(locale).toBe("de-DE");
  });
});
