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

import { GA_MEASUREMENT_ID } from "./google-analytics";
import { trackGoogleAnalyticsServerEvent } from "./google-analytics-server";

describe("trackGoogleAnalyticsServerEvent", () => {
  it("no-ops when the Measurement Protocol secret is missing", async () => {
    const fetchFn = vi.fn(
      async () => new Response("{}", { status: 204 }),
    ) as unknown as typeof fetch;

    await trackGoogleAnalyticsServerEvent("project_created", { status: "created" }, { fetchFn });

    expect(vi.mocked(fetchFn)).not.toHaveBeenCalled();
  });

  it("posts a GA4 Measurement Protocol event", async () => {
    const fetchFn = vi.fn(
      async () => new Response("{}", { status: 204 }),
    ) as unknown as typeof fetch;

    await trackGoogleAnalyticsServerEvent(
      "translation_job_completed",
      { status: "succeeded", source: "translation_job" },
      {
        apiSecret: "test-secret",
        clientId: "client-1",
        fetchFn,
      },
    );

    expect(vi.mocked(fetchFn)).toHaveBeenCalledOnce();
    const [requestUrl, requestInit] = vi.mocked(fetchFn).mock.calls[0] ?? [];
    if (typeof requestUrl !== "string") {
      throw new Error("Expected Measurement Protocol URL string");
    }
    expect(requestUrl).toContain(`measurement_id=${GA_MEASUREMENT_ID}`);
    expect(requestUrl).toContain("api_secret=test-secret");
    expect(requestInit).toMatchObject({ method: "POST" });
    const requestBody = requestInit?.body;
    if (typeof requestBody !== "string") {
      throw new Error("Expected JSON string request body");
    }
    expect(JSON.parse(requestBody)).toEqual({
      client_id: "client-1",
      events: [
        {
          name: "translation_job_completed",
          params: { status: "succeeded", source: "translation_job" },
        },
      ],
    });
  });

  it("swallows network failures", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    await expect(
      trackGoogleAnalyticsServerEvent(
        "seat_added",
        { status: "created" },
        {
          apiSecret: "test-secret",
          fetchFn,
        },
      ),
    ).resolves.toBeUndefined();
  });
});
