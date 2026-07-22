/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import "dotenv/config";

process.env.WORKOS_COOKIE_PASSWORD ??= "test-workos-cookie-password-at-least-32-chars";
process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ??= "http://localhost:3000/auth/callback";

import { describe, expect, it, vi } from "vite-plus/test";

const { getSignInUrlMock } = vi.hoisted(() => ({
  getSignInUrlMock: vi.fn(),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  getSignInUrl: getSignInUrlMock,
}));

describe("GET /auth/sign-in", () => {
  it("redirects to the hosted WorkOS sign-in URL", async () => {
    getSignInUrlMock.mockResolvedValue("https://auth.example.com/sign-in");

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost:3000/auth/sign-in?returnTo=/dashboard"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://auth.example.com/sign-in");
    expect(getSignInUrlMock).toHaveBeenCalledWith({ returnTo: "/dashboard" });
  });
});
