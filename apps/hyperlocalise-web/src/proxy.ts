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
import { authkitProxy } from "@workos-inc/authkit-nextjs";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import {
  APP_LOCALE_COOKIE_NAME,
  APP_LOCALE_HEADER_NAME,
  getAppLocaleFromRequest,
  normalizeAppLocale,
} from "@/lib/app-i18n/locales";
import { isFixtureAuthEnabled } from "@/lib/e2e/config";
import { hasFixtureSessionCookie } from "@/lib/e2e/fixture-auth";
import { buildCrowdinAppFrameAncestorsCsp } from "@/lib/crowdin-app/frame-ancestors";
import { REQUEST_URL_HEADER } from "@/lib/workos/request-url-header";

const workosProxy = authkitProxy();
type WorkosProxyResult = Awaited<ReturnType<typeof workosProxy>>;

function isCrowdinAppPath(pathname: string) {
  return pathname === "/crowdin-app" || pathname.startsWith("/crowdin-app/");
}

function applyCrowdinAppFrameAncestors(response: NextResponse): NextResponse {
  // Single CSP source for iframe HTML — see frame-ancestors.ts.
  response.headers.delete("X-Frame-Options");
  response.headers.set("Content-Security-Policy", buildCrowdinAppFrameAncestorsCsp());
  return response;
}

function shouldBypassWorkosProxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isFixtureAuthEnabled()) {
    return false;
  }

  if (pathname.startsWith("/api/e2e/")) {
    return true;
  }

  return hasFixtureSessionCookie(request.headers.get("cookie") ?? undefined);
}

function nextWithRequestUrl(request: NextRequest): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_URL_HEADER, request.url);
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

/**
 * Guarantee `x-url` is forwarded as a request header so Server Components can
 * recover the original path for post-login returnTo. AuthKit usually sets this;
 * fixture-auth bypass and other bare `NextResponse.next()` paths do not.
 */
export function ensureRequestUrlHeader(request: NextRequest, response: NextResponse): NextResponse {
  if (response.headers.has("location")) {
    return response;
  }

  const requestHeaderName = `x-middleware-request-${REQUEST_URL_HEADER}`;
  response.headers.set(requestHeaderName, request.url);

  const override = response.headers.get("x-middleware-override-headers");
  if (override == null || override === "") {
    const next = nextWithRequestUrl(request);
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower.startsWith("x-middleware-")) {
        return;
      }
      if (lower === "set-cookie") {
        next.headers.append(key, value);
        return;
      }
      next.headers.set(key, value);
    });
    return next;
  }

  const names = override
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (!names.includes(REQUEST_URL_HEADER)) {
    response.headers.set("x-middleware-override-headers", [...names, REQUEST_URL_HEADER].join(","));
  }

  return response;
}

async function maybeWorkosProxy(request: NextRequest, event: NextFetchEvent) {
  if (shouldBypassWorkosProxy(request)) {
    return nextWithRequestUrl(request);
  }

  const response = await workosProxy(request, event);
  if (!(response instanceof NextResponse)) {
    return response;
  }

  const isCrowdinAppRequest = isCrowdinAppPath(request.nextUrl.pathname);
  if (isCrowdinAppRequest && response.headers.has("location")) {
    return applyCrowdinAppFrameAncestors(
      new NextResponse("Crowdin app unavailable", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }),
    );
  }

  const nextResponse = ensureRequestUrlHeader(request, response);
  if (isCrowdinAppRequest) {
    return applyCrowdinAppFrameAncestors(nextResponse);
  }

  return nextResponse;
}

const PUBLIC_LOCALIZED_PREFIXES = ["/product", "/use-cases", "/blog"];
const PUBLIC_LOCALIZED_PATHS = new Set(["/", "/privacy", "/terms", "/trust-center"]);
const PROTECTED_LOCALIZED_PREFIXES = ["/dashboard", "/org"];
const NON_LOCALE_ROOT_PREFIXES = ["/auth", "/install", "/api", "/crowdin-app"];

function splitLocalePath(pathname: string): {
  locale: string | null;
  pathnameWithoutLocale: string;
} {
  const [, firstSegment, ...rest] = pathname.split("/");
  const locale = firstSegment ? normalizeAppLocale(firstSegment) : null;

  if (!locale) {
    return { locale: null, pathnameWithoutLocale: pathname };
  }

  const pathnameWithoutLocale = `/${rest.join("/")}`.replace(/\/+$/, "") || "/";
  return { locale, pathnameWithoutLocale };
}

function isPublicLocalizedPath(pathname: string): boolean {
  if (PUBLIC_LOCALIZED_PATHS.has(pathname)) {
    return true;
  }

  return PUBLIC_LOCALIZED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isProtectedLocalizedPath(pathname: string): boolean {
  return PROTECTED_LOCALIZED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isLocalizedAppPath(pathname: string): boolean {
  return isPublicLocalizedPath(pathname) || isProtectedLocalizedPath(pathname);
}

function isNonLocaleRootPath(pathname: string): boolean {
  return NON_LOCALE_ROOT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Paths like /wp-links.php are captured by the /[lang] segment even though the
 * first segment is not a supported locale. Reject them in proxy before rendering
 * so root layout withAuth() does not throw when AuthKit middleware was skipped.
 */
export function isUnsupportedLocalePath(pathname: string): boolean {
  if (isNonLocaleRootPath(pathname)) {
    return false;
  }

  const firstSegment = pathname.split("/").filter(Boolean)[0];
  if (!firstSegment) {
    return false;
  }

  if (normalizeAppLocale(firstSegment) !== null) {
    return false;
  }

  // Paths like /product or /blog without a locale prefix should redirect, not 404.
  if (isLocalizedAppPath(pathname)) {
    return false;
  }

  return true;
}

function applyLocaleToResponse(response: WorkosProxyResult, locale: string): WorkosProxyResult {
  if (!response) {
    return response;
  }

  response.headers.set(APP_LOCALE_HEADER_NAME, locale);

  if (response instanceof NextResponse) {
    response.cookies.set({
      name: APP_LOCALE_COOKIE_NAME,
      value: locale,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  return response;
}

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  if (isUnsupportedLocalePath(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  const { locale, pathnameWithoutLocale } = splitLocalePath(pathname);

  if (locale && isPublicLocalizedPath(pathnameWithoutLocale)) {
    const response = await maybeWorkosProxy(request, event);
    return applyLocaleToResponse(response, locale);
  }

  if (locale && isProtectedLocalizedPath(pathnameWithoutLocale)) {
    const response = await maybeWorkosProxy(request, event);
    return applyLocaleToResponse(response, locale);
  }

  if (!locale && isLocalizedAppPath(pathname)) {
    const nextLocale = getAppLocaleFromRequest(request);
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = pathname === "/" ? `/${nextLocale}` : `/${nextLocale}${pathname}`;
    return NextResponse.redirect(nextUrl);
  }

  return maybeWorkosProxy(request, event);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|api|mcp|\\.well-known|install|sitemap\\.xml|robots\\.txt).*)",
    "/api/:path*",
  ],
};
