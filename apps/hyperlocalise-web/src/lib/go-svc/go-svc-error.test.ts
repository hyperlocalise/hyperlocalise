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
import { describe, expect, it, vi } from "vite-plus/test";

import { GoSvcClientError } from "./go-svc-client";
import { goSvcErrorMessage, isCatDeferredToApp } from "./go-svc-error";

describe("goSvcErrorMessage", () => {
  it("maps transport failures to the localized fallback and logs them", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      for (const code of ["network_error", "missing_access_token"] as const) {
        warn.mockClear();
        const error = new GoSvcClientError({
          code,
          message: "implementation detail",
        });

        expect(goSvcErrorMessage(error, "Could not reach service")).toBe("Could not reach service");
        expect(warn).toHaveBeenCalledWith("[go-svc] browser request failed", error);
      }
    } finally {
      warn.mockRestore();
    }
  });

  it("preserves API error messages from GoSvcClientError", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const error = new GoSvcClientError({
        code: "forbidden",
        message: "Team is private",
        status: 403,
      });

      expect(goSvcErrorMessage(error, "Could not reach service")).toBe("Team is private");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("recognizes CAT routes that stay on the app", () => {
    expect(
      isCatDeferredToApp(
        new GoSvcClientError({
          code: "provider_cat_deferred",
          message: "Connected TMS CAT remains on the app",
          status: 501,
        }),
      ),
    ).toBe(true);
    expect(
      isCatDeferredToApp(
        new GoSvcClientError({
          code: "string_context_deferred",
          message: "Fresh string context stays on the app",
          status: 501,
        }),
      ),
    ).toBe(true);
    expect(
      isCatDeferredToApp(
        new GoSvcClientError({
          code: "forbidden",
          message: "Insufficient permissions",
          status: 403,
        }),
      ),
    ).toBe(false);
  });

  it("preserves generic Error messages and falls back for unknown values", () => {
    expect(goSvcErrorMessage(new Error("boom"), "fallback")).toBe("boom");
    expect(goSvcErrorMessage("not-an-error", "fallback")).toBe("fallback");
    expect(goSvcErrorMessage(null, "fallback")).toBe("fallback");
  });
});
