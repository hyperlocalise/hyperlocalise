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
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  env: { TILION_API_KEY: undefined as string | undefined },
  createTilionAuditBrowserSession: vi.fn(),
  createAuditBrowserSession: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));

vi.mock("./tilion-browser", () => ({
  createTilionAuditBrowserSession: mocks.createTilionAuditBrowserSession,
}));

vi.mock("./sandbox-browser", () => ({
  createAuditBrowserSession: mocks.createAuditBrowserSession,
}));

import { err, ok } from "@/lib/primitives/result/results";

import { createAuditPageRenderer } from "./audit-page-renderer";

const tilionRenderer = { render: vi.fn(), close: vi.fn() };
const sandboxRenderer = { render: vi.fn(), close: vi.fn() };
const originalTilionApiKey = process.env.TILION_API_KEY;

describe("createAuditPageRenderer", () => {
  beforeEach(() => {
    delete process.env.TILION_API_KEY;
    mocks.env.TILION_API_KEY = undefined;
    mocks.createTilionAuditBrowserSession.mockReset();
    mocks.createAuditBrowserSession.mockReset();
    mocks.createAuditBrowserSession.mockResolvedValue(sandboxRenderer);
  });

  afterEach(() => {
    if (originalTilionApiKey === undefined) {
      delete process.env.TILION_API_KEY;
    } else {
      process.env.TILION_API_KEY = originalTilionApiKey;
    }
  });

  it("uses the sandbox when no Tilion key is set", async () => {
    expect(await createAuditPageRenderer()).toBe(sandboxRenderer);
    expect(mocks.createTilionAuditBrowserSession).not.toHaveBeenCalled();
  });

  it("uses Tilion when t3-env has the key", async () => {
    mocks.env.TILION_API_KEY = "tl_key";
    mocks.createTilionAuditBrowserSession.mockResolvedValue(ok(tilionRenderer));

    expect(await createAuditPageRenderer()).toBe(tilionRenderer);
    expect(mocks.createTilionAuditBrowserSession).toHaveBeenCalledWith({ apiKey: "tl_key" });
    expect(mocks.createAuditBrowserSession).not.toHaveBeenCalled();
  });

  it("uses Tilion when process.env has the key even if t3-env does not", async () => {
    process.env.TILION_API_KEY = "ph_live_from_process";
    mocks.createTilionAuditBrowserSession.mockResolvedValue(ok(tilionRenderer));

    expect(await createAuditPageRenderer()).toBe(tilionRenderer);
    expect(mocks.createTilionAuditBrowserSession).toHaveBeenCalledWith({
      apiKey: "ph_live_from_process",
    });
    expect(mocks.createAuditBrowserSession).not.toHaveBeenCalled();
  });

  it("falls back to the sandbox when Tilion cannot start", async () => {
    mocks.env.TILION_API_KEY = "tl_key";
    mocks.createTilionAuditBrowserSession.mockResolvedValue(
      err({ code: "tilion_session_create_failed", status: 503 }),
    );

    expect(await createAuditPageRenderer()).toBe(sandboxRenderer);
  });
});
