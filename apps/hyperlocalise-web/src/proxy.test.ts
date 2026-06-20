import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vite-plus/test";

import proxy, { isUnsupportedLocalePath } from "./proxy";

const { authkitProxyMock } = vi.hoisted(() => ({
  authkitProxyMock: vi.fn(),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  authkitProxy: () => authkitProxyMock,
}));

function createRequest(pathname: string) {
  return new NextRequest(`https://www.hyperlocalise.com${pathname}`);
}

describe("isUnsupportedLocalePath", () => {
  it("flags bot scan paths that would match /[lang]", () => {
    expect(isUnsupportedLocalePath("/wp-links.php")).toBe(true);
    expect(isUnsupportedLocalePath("/xstelth.php")).toBe(true);
    expect(isUnsupportedLocalePath("/random-page")).toBe(true);
  });

  it("allows supported locale paths", () => {
    expect(isUnsupportedLocalePath("/en")).toBe(false);
    expect(isUnsupportedLocalePath("/en/blog")).toBe(false);
    expect(isUnsupportedLocalePath("/EN/product/localisation")).toBe(false);
  });

  it("allows non-locale root routes", () => {
    expect(isUnsupportedLocalePath("/auth/sign-in")).toBe(false);
    expect(isUnsupportedLocalePath("/install")).toBe(false);
    expect(isUnsupportedLocalePath("/api/auth/callback")).toBe(false);
  });

  it("allows localized marketing paths without a locale prefix", () => {
    expect(isUnsupportedLocalePath("/product/agents-automation")).toBe(false);
    expect(isUnsupportedLocalePath("/use-cases/saas")).toBe(false);
    expect(isUnsupportedLocalePath("/blog")).toBe(false);
    expect(isUnsupportedLocalePath("/privacy")).toBe(false);
  });

  it("allows the site root", () => {
    expect(isUnsupportedLocalePath("/")).toBe(false);
  });
});

describe("proxy", () => {
  it("returns 404 for unsupported locale paths before AuthKit runs", async () => {
    authkitProxyMock.mockReset();
    const response = await proxy(createRequest("/wp-links.php"), {} as never);

    expect(response?.status).toBe(404);
    expect(authkitProxyMock).not.toHaveBeenCalled();
  });

  it("still delegates supported locale paths to AuthKit", async () => {
    authkitProxyMock.mockReset();
    authkitProxyMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const response = await proxy(createRequest("/en/blog"), {} as never);

    expect(authkitProxyMock).toHaveBeenCalledOnce();
    expect(response?.status).toBe(200);
  });

  it("redirects localized marketing paths without a locale prefix", async () => {
    authkitProxyMock.mockReset();

    const response = await proxy(createRequest("/product/agents-automation"), {} as never);

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe(
      "https://www.hyperlocalise.com/en/product/agents-automation",
    );
    expect(authkitProxyMock).not.toHaveBeenCalled();
  });

  it("redirects blog paths without a locale prefix", async () => {
    authkitProxyMock.mockReset();

    const response = await proxy(createRequest("/blog"), {} as never);

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("https://www.hyperlocalise.com/en/blog");
    expect(authkitProxyMock).not.toHaveBeenCalled();
  });

  it("delegates /api paths to AuthKit instead of returning 404", async () => {
    authkitProxyMock.mockReset();
    authkitProxyMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const response = await proxy(createRequest("/api/auth/callback"), {} as never);

    expect(authkitProxyMock).toHaveBeenCalledOnce();
    expect(response?.status).toBe(200);
  });
});
