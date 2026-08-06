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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { APIError } from "@vercel/sandbox";

const sandboxGetMock = vi.hoisted(() => vi.fn());

vi.mock("@vercel/sandbox", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vercel/sandbox")>()),
  Sandbox: {
    get: sandboxGetMock,
  },
}));

vi.mock("@/lib/agent-runtime/workspaces/vercel-sandbox-runtime", () => ({
  createVercelSandboxWorkspace: vi.fn(),
  stopWorkspace: vi.fn(),
}));

import { isRepositorySandboxAvailable } from "./repository-sandbox";

describe("isRepositorySandboxAvailable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks availability without resuming the stored sandbox", async () => {
    sandboxGetMock.mockResolvedValueOnce({ name: "sandbox_existing" });

    await expect(isRepositorySandboxAvailable("sandbox_existing")).resolves.toBe(true);

    expect(sandboxGetMock).toHaveBeenCalledWith({
      name: "sandbox_existing",
      resume: false,
    });
  });

  it("reports a deleted stored sandbox as unavailable", async () => {
    sandboxGetMock.mockRejectedValueOnce(new APIError(new Response(null, { status: 404 })));

    await expect(isRepositorySandboxAvailable("sandbox_deleted")).resolves.toBe(false);
  });

  it("does not replace a sandbox when the availability probe fails transiently", async () => {
    const error = new APIError(new Response(null, { status: 503 }));
    sandboxGetMock.mockRejectedValueOnce(error);

    await expect(isRepositorySandboxAvailable("sandbox_existing")).rejects.toBe(error);
  });
});
