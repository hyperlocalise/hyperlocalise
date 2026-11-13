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

import { describe, expect, it, vi } from "vite-plus/test";

const { captureMock } = vi.hoisted(() => ({
  captureMock: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: {
    __loaded: false,
    capture: captureMock,
  },
}));

import posthog from "posthog-js";

import { capturePostHogClientEvent } from "./posthog-client";

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
