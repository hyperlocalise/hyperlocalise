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
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  verifyCanvaUserTokenMock: vi.fn(),
  env: {
    CANVA_APP_ID: undefined as string | undefined,
  },
}));

vi.mock("@/lib/env", () => ({
  env: mocks.env,
}));

vi.mock("@/lib/canva/auth", () => ({
  verifyCanvaUserToken: mocks.verifyCanvaUserTokenMock,
}));

import { createCanvaJwtMiddleware, type CanvaJwtVariables } from "./canva-jwt";

function createTestApp(required: boolean) {
  const app = new Hono<{ Variables: CanvaJwtVariables }>();
  app.get("/probe", createCanvaJwtMiddleware({ required }), (c) => {
    return c.json({ canvaUser: c.var.canvaUser ?? null }, 200);
  });
  return app;
}

describe("createCanvaJwtMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.CANVA_APP_ID = undefined;
    mocks.verifyCanvaUserTokenMock.mockResolvedValue({
      userId: "canva-user",
      brandId: "canva-brand",
    });
  });

  it("rejects required requests when the Canva user token is missing even without CANVA_APP_ID", async () => {
    const app = createTestApp(true);

    const response = await app.request("/probe");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "canva_user_token_required",
    });
    expect(mocks.verifyCanvaUserTokenMock).not.toHaveBeenCalled();
  });

  it("rejects required requests when a token is present but CANVA_APP_ID is unset", async () => {
    const app = createTestApp(true);

    const response = await app.request("/probe", {
      headers: {
        "X-Canva-User-Token": "user-token",
      },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "canva_user_token_invalid",
    });
    expect(mocks.verifyCanvaUserTokenMock).not.toHaveBeenCalled();
  });

  it("allows optional requests without a token when CANVA_APP_ID is unset", async () => {
    const app = createTestApp(false);

    const response = await app.request("/probe");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ canvaUser: null });
  });

  it("verifies and attaches canvaUser when required and configured", async () => {
    mocks.env.CANVA_APP_ID = "app-id";
    const app = createTestApp(true);

    const response = await app.request("/probe", {
      headers: {
        "X-Canva-User-Token": "user-token",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      canvaUser: {
        userId: "canva-user",
        brandId: "canva-brand",
      },
    });
    expect(mocks.verifyCanvaUserTokenMock).toHaveBeenCalledWith("user-token", "app-id");
  });
});
