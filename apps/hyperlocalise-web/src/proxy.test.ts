import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { buildCrowdinAppFrameAncestorsCsp } from "@/lib/crowdin-app/frame-ancestors";
import { REQUEST_URL_HEADER } from "@/lib/workos/request-url-header";
import proxy, { ensureRequestUrlHeader, isUnsupportedLocalePath } from "./proxy";

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
    expect(isUnsupportedLocalePath("/zh-CN/blog")).toBe(false);
    expect(isUnsupportedLocalePath("/fr-FR/org/acme/dashboard")).toBe(false);
  });

  it("allows non-locale root routes", () => {
    expect(isUnsupportedLocalePath("/auth/sign-in")).toBe(false);
    expect(isUnsupportedLocalePath("/install")).toBe(false);
    expect(isUnsupportedLocalePath("/api/auth/callback")).toBe(false);
    expect(isUnsupportedLocalePath("/crowdin-app/inbox")).toBe(false);
    expect(isUnsupportedLocalePath("/crowdin-app/manifest.json")).toBe(false);
  });

  it("rejects removed fixture browser routes", () => {
    expect(isUnsupportedLocalePath("/e2e/login")).toBe(true);
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

describe("ensureRequestUrlHeader", () => {
  it("adds x-url request overrides when AuthKit did not set them", () => {
    const request = createRequest("/en-US/org/acme/projects/proj_1");
    const response = ensureRequestUrlHeader(request, NextResponse.next());

    expect(response.headers.get(`x-middleware-request-${REQUEST_URL_HEADER}`)).toBe(request.url);
    expect(response.headers.get("x-middleware-override-headers")?.split(",")).toContain(
      REQUEST_URL_HEADER,
    );
  });

  it("preserves existing AuthKit overrides and still sets x-url", () => {
    const request = createRequest("/en-US/org/acme/projects/proj_1");
    const response = NextResponse.next();
    response.headers.set("x-middleware-override-headers", "x-workos-middleware,x-workos-session");
    response.headers.set("x-middleware-request-x-workos-middleware", "true");
    response.headers.set("x-middleware-request-x-workos-session", "sealed");

    const next = ensureRequestUrlHeader(request, response);

    expect(next.headers.get(`x-middleware-request-${REQUEST_URL_HEADER}`)).toBe(request.url);
    expect(next.headers.get("x-middleware-override-headers")).toContain(REQUEST_URL_HEADER);
    expect(next.headers.get("x-middleware-request-x-workos-session")).toBe("sealed");
  });
});

describe("proxy", () => {
  it("returns 404 for unsupported locale paths before AuthKit runs", async () => {
    authkitProxyMock.mockReset();
    const response = await proxy(createRequest("/wp-links.php"), {} as never);

    expect(response?.status).toBe(404);
    expect(authkitProxyMock).not.toHaveBeenCalled();
  });

  it("still delegates supported locale paths to AuthKit and forwards x-url", async () => {
    authkitProxyMock.mockReset();
    authkitProxyMock.mockResolvedValueOnce(NextResponse.next());

    const request = createRequest("/en/org/acme/projects/proj_1");
    const response = await proxy(request, {} as never);

    expect(authkitProxyMock).toHaveBeenCalledOnce();
    expect(response?.status).toBe(200);
    expect(response?.headers.get(`x-middleware-request-${REQUEST_URL_HEADER}`)).toBe(request.url);
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
    authkitProxyMock.mockResolvedValueOnce(NextResponse.next());

    const response = await proxy(createRequest("/api/auth/callback"), {} as never);

    expect(authkitProxyMock).toHaveBeenCalledOnce();
    expect(response?.status).toBe(200);
  });

  it("sets Crowdin App frame-ancestors CSP on iframe pages without AuthKit", async () => {
    authkitProxyMock.mockReset();

    const response = await proxy(createRequest("/crowdin-app/inbox"), {} as never);

    expect(authkitProxyMock).not.toHaveBeenCalled();
    expect(response?.status).toBe(200);
    expect(response?.headers.get("Content-Security-Policy")).toBe(
      buildCrowdinAppFrameAncestorsCsp(),
    );
    expect(response?.headers.get("X-Frame-Options")).toBeNull();
  });
});
