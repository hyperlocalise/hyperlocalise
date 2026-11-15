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
// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { captureMock, captureExceptionMock } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: {
    __loaded: false,
    capture: captureMock,
    captureException: captureExceptionMock,
  },
}));

import posthog from "posthog-js";

import { capturePostHogClientEvent, capturePostHogClientException } from "./posthog-client";

beforeEach(() => {
  posthog.__loaded = false;
  captureMock.mockReset();
  captureExceptionMock.mockReset();
});

describe("capturePostHogClientEvent", () => {
  it("does not capture before PostHog has initialized", () => {
    capturePostHogClientEvent("marketing_cta_click", { cta: "sign_in" });

    expect(captureMock).not.toHaveBeenCalled();
  });

  it("captures after PostHog has initialized", () => {
    posthog.__loaded = true;

    capturePostHogClientEvent("checkout_started", { status: "started", source: "billing" });

    expect(captureMock).toHaveBeenCalledWith("checkout_started", {
      status: "started",
      source: "billing",
    });
  });
});

describe("capturePostHogClientException", () => {
  it("does not capture before PostHog has initialized", () => {
    capturePostHogClientException(new Error("boom"), { source: "error_boundary" });

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("captures after PostHog has initialized", () => {
    posthog.__loaded = true;
    const error = new Error("boom");

    capturePostHogClientException(error, { source: "error_boundary", feature: "locale" });

    expect(captureExceptionMock).toHaveBeenCalledWith(error, {
      source: "error_boundary",
      feature: "locale",
    });
  });

  it("swallows SDK failures", () => {
    posthog.__loaded = true;
    captureExceptionMock.mockImplementation(() => {
      throw new Error("posthog down");
    });

    expect(() => capturePostHogClientException(new Error("boom"))).not.toThrow();
  });
});
