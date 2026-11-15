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

import {
  capturePostHogServerRequestError,
  posthogDistinctIdFromCookieHeader,
} from "./posthog-request-error";

describe("posthogDistinctIdFromCookieHeader", () => {
  it("reads the distinct id from the PostHog cookie", () => {
    const cookie = `ph_phc_test_posthog=${encodeURIComponent(JSON.stringify({ distinct_id: "anon_123" }))}`;

    expect(posthogDistinctIdFromCookieHeader(cookie, "phc_test")).toBe("anon_123");
  });

  it("returns undefined for missing or malformed cookies", () => {
    expect(posthogDistinctIdFromCookieHeader(undefined, "phc_test")).toBeUndefined();
    expect(posthogDistinctIdFromCookieHeader("other=1", "phc_test")).toBeUndefined();
    expect(
      posthogDistinctIdFromCookieHeader("ph_phc_test_posthog=%7Bnot-json", "phc_test"),
    ).toBeUndefined();
  });
});

describe("capturePostHogServerRequestError", () => {
  it("skips the Edge runtime", async () => {
    const captureExceptionFn = vi.fn();

    await capturePostHogServerRequestError(
      new Error("edge boom"),
      { method: "GET", headers: {} },
      { routeType: "render" },
      {
        projectToken: "phc_test",
        runtime: "edge",
        captureExceptionFn,
      },
    );

    expect(captureExceptionFn).not.toHaveBeenCalled();
  });

  it("skips Next.js control-flow throws", async () => {
    const captureExceptionFn = vi.fn();

    await capturePostHogServerRequestError(
      new Error("NEXT_REDIRECT"),
      { method: "GET", headers: {} },
      { routeType: "render" },
      {
        projectToken: "phc_test",
        runtime: "nodejs",
        captureExceptionFn,
      },
    );

    expect(captureExceptionFn).not.toHaveBeenCalled();
  });

  it("captures node request errors with cookie identity and digest", async () => {
    const captureExceptionFn = vi.fn();
    const error = Object.assign(new Error("rsc boom"), { digest: "abc123" });
    const cookie = `ph_phc_test_posthog=${encodeURIComponent(JSON.stringify({ distinct_id: "anon_123" }))}`;

    await capturePostHogServerRequestError(
      error,
      { method: "GET", path: "/en/org/acme/secret", headers: { cookie } },
      { routeType: "render", routePath: "/[lang]/(authenticated)/org/[organizationSlug]" },
      {
        projectToken: "phc_test",
        runtime: "nodejs",
        captureExceptionFn,
      },
    );

    expect(captureExceptionFn).toHaveBeenCalledOnce();
    expect(captureExceptionFn).toHaveBeenCalledWith({
      distinctId: "anon_123",
      error,
      properties: {
        source: "server_request",
        feature: "render",
        digest: "abc123",
      },
    });
  });
});
