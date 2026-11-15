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

import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { capturePostHogClientExceptionMock } = vi.hoisted(() => ({
  capturePostHogClientExceptionMock: vi.fn(),
}));

vi.mock("./posthog-client", () => ({
  capturePostHogClientException: capturePostHogClientExceptionMock,
}));

import { useCaptureRouteError } from "./use-capture-route-error";

function Probe({ error, feature }: { error: Error; feature: string }) {
  useCaptureRouteError(error, feature);
  return null;
}

afterEach(() => {
  vi.restoreAllMocks();
  capturePostHogClientExceptionMock.mockReset();
});

describe("useCaptureRouteError", () => {
  it("logs the error and reports it to PostHog", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("route failed");

    render(<Probe error={error} feature="locale" />);

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(error);
    });
    expect(capturePostHogClientExceptionMock).toHaveBeenCalledWith(error, {
      source: "error_boundary",
      feature: "locale",
    });
  });
});
