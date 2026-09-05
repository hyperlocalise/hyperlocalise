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
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { buildCrowdinAppFrameAncestorsCsp } from "@/lib/crowdin-app/frame-ancestors";
import { APP_LOCALE_HEADER_NAME } from "@/lib/app-i18n/locales";
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

  it("allows opaque UUID roots used by BotID challenge scripts", () => {
    expect(
      isUnsupportedLocalePath(
        "/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/a-4-a/c.js",
      ),
    ).toBe(false);
    expect(
      isUnsupportedLocalePath(
        "/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/2d206a39-8ed7-437e-a3be-862e0f06eea3/p.js",
      ),
    ).toBe(false);
  });

  it("rejects removed fixture browser routes", () => {
    expect(isUnsupportedLocalePath("/e2e/login")).toBe(true);
  });

  it("allows localized marketing paths without a locale prefix", () => {
    expect(isUnsupportedLocalePath("/product/agents-automation")).toBe(false);
    expect(isUnsupportedLocalePath("/use-cases/saas")).toBe(false);
    expect(isUnsupportedLocalePath("/blog")).toBe(false);
    expect(isUnsupportedLocalePath("/privacy")).toBe(false);
    expect(isUnsupportedLocalePath("/pricing")).toBe(false);
    expect(isUnsupportedLocalePath("/company")).toBe(false);
    expect(isUnsupportedLocalePath("/contact")).toBe(false);
    expect(isUnsupportedLocalePath("/startups")).toBe(false);
    expect(isUnsupportedLocalePath("/localisation-audit")).toBe(false);
    expect(isUnsupportedLocalePath("/localisation-audit/stripe-com")).toBe(false);
    expect(isUnsupportedLocalePath("/chat/acme/11111111-1111-4111-8111-111111111111")).toBe(false);
    expect(isUnsupportedLocalePath("/dashboard")).toBe(false);
    expect(isUnsupportedLocalePath("/claim-domain/stripe-com-abcdef")).toBe(false);
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
    expect(response?.headers.get(`x-middleware-request-${APP_LOCALE_HEADER_NAME}`)).toBe("en");
    expect(response?.headers.get("x-middleware-override-headers")?.split(",")).toContain(
      APP_LOCALE_HEADER_NAME,
    );
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

  it("redirects claim-domain paths without a locale prefix", async () => {
    authkitProxyMock.mockReset();

    const response = await proxy(createRequest("/claim-domain/tourfinder-au-kidldm"), {} as never);

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe(
      "https://www.hyperlocalise.com/en/claim-domain/tourfinder-au-kidldm",
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

  it("redirects pricing paths without a locale prefix", async () => {
    authkitProxyMock.mockReset();

    const response = await proxy(createRequest("/pricing"), {} as never);

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("https://www.hyperlocalise.com/en/pricing");
    expect(authkitProxyMock).not.toHaveBeenCalled();
  });

  it("redirects company paths without a locale prefix", async () => {
    authkitProxyMock.mockReset();

    const response = await proxy(createRequest("/company"), {} as never);

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("https://www.hyperlocalise.com/en/company");
    expect(authkitProxyMock).not.toHaveBeenCalled();
  });

  it("redirects contact paths without a locale prefix", async () => {
    authkitProxyMock.mockReset();

    const response = await proxy(createRequest("/contact"), {} as never);

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("https://www.hyperlocalise.com/en/contact");
    expect(authkitProxyMock).not.toHaveBeenCalled();
  });

  it("delegates /api paths to AuthKit instead of returning 404", async () => {
    authkitProxyMock.mockReset();
    authkitProxyMock.mockResolvedValueOnce(NextResponse.next());

    const response = await proxy(createRequest("/api/auth/callback"), {} as never);

    expect(authkitProxyMock).toHaveBeenCalledOnce();
    expect(response?.status).toBe(200);
  });

  it("does not 404 opaque UUID challenge paths as unsupported locale paths", async () => {
    authkitProxyMock.mockReset();
    authkitProxyMock.mockResolvedValueOnce(NextResponse.next());

    const response = await proxy(
      createRequest(
        "/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/a-4-a/c.js",
      ),
      {} as never,
    );

    expect(response?.status).not.toBe(404);
    expect(authkitProxyMock).toHaveBeenCalledOnce();
  });

  it("runs Crowdin App iframe pages through AuthKit before applying frame-ancestors CSP", async () => {
    authkitProxyMock.mockReset();
    authkitProxyMock.mockResolvedValueOnce(NextResponse.next());

    const response = await proxy(createRequest("/crowdin-app/inbox"), {} as never);

    expect(authkitProxyMock).toHaveBeenCalledOnce();
    expect(response?.status).toBe(200);
    expect(response?.headers.get(`x-middleware-request-${REQUEST_URL_HEADER}`)).toBe(
      "https://www.hyperlocalise.com/crowdin-app/inbox",
    );
    expect(response?.headers.get("Content-Security-Policy")).toBe(
      buildCrowdinAppFrameAncestorsCsp(),
    );
    expect(response?.headers.get("X-Frame-Options")).toBeNull();
  });

  it("keeps AuthKit redirects inside the Crowdin App iframe", async () => {
    authkitProxyMock.mockReset();
    authkitProxyMock.mockResolvedValueOnce(
      NextResponse.redirect("https://www.hyperlocalise.com/auth/sign-in"),
    );

    const response = await proxy(createRequest("/crowdin-app/inbox"), {} as never);

    expect(response?.status).toBe(503);
    expect(await response?.text()).toBe("Crowdin app unavailable");
    expect(response?.headers.get("location")).toBeNull();
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(response?.headers.get("Content-Security-Policy")).toBe(
      buildCrowdinAppFrameAncestorsCsp(),
    );
    expect(response?.headers.get("X-Frame-Options")).toBeNull();
  });
});
