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
import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const captureEditorSavesMock = vi.fn(async () => ({
  organizationsProcessed: 1,
  organizationsSkipped: 0,
  eventsProcessed: 3,
  segmentsRecorded: 2,
}));

async function createClient(input?: { cronSecret?: string | null }) {
  const cronSecret = input?.cronSecret === null ? undefined : (input?.cronSecret ?? "cron-secret");

  vi.resetModules();
  vi.doMock("@/lib/reporting/editor-save-capture", () => ({
    captureEditorSaves: captureEditorSavesMock,
  }));
  vi.doMock("@/lib/env", () => ({
    env: {
      CRON_SECRET: cronSecret,
    },
  }));

  const { createReportingCaptureRoutes } = await import("./reporting-capture.route");

  return testClient(createReportingCaptureRoutes());
}

describe("reporting capture cron route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/reporting/editor-save-capture");
    vi.doUnmock("@/lib/env");
    captureEditorSavesMock.mockClear();
  });

  it("rejects requests without the cron secret", async () => {
    const client = await createClient();
    const response = await client.index.$get();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    expect(captureEditorSavesMock).not.toHaveBeenCalled();
  });

  it("answers 503 when no cron secret is configured", async () => {
    const client = await createClient({ cronSecret: null });
    const response = await client.index.$get();
    expect(response.status).toBe(503);
  });

  it("records editor saves when authorized", async () => {
    const client = await createClient();
    const response = await client.index.$get(
      {},
      { headers: { authorization: "Bearer cron-secret" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: {
        organizationsProcessed: 1,
        organizationsSkipped: 0,
        eventsProcessed: 3,
        segmentsRecorded: 2,
      },
    });
    expect(captureEditorSavesMock).toHaveBeenCalledTimes(1);
  });
});
