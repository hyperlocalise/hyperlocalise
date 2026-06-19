import { authkitProxy } from "@workos-inc/authkit-nextjs";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import {
  APP_LOCALE_COOKIE_NAME,
  APP_LOCALE_HEADER_NAME,
  getAppLocaleFromRequest,
  normalizeAppLocale,
} from "@/lib/app-i18n/locales";

const workosProxy = authkitProxy();
type WorkosProxyResult = Awaited<ReturnType<typeof workosProxy>>;

const PUBLIC_LOCALIZED_PREFIXES = ["/product", "/use-cases", "/blog"];
const PUBLIC_LOCALIZED_PATHS = new Set(["/", "/privacy", "/terms", "/trust-center"]);
const PROTECTED_LOCALIZED_PREFIXES = ["/dashboard", "/org"];
const NON_LOCALE_ROOT_PREFIXES = ["/auth", "/install", "/api"];

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

  return normalizeAppLocale(firstSegment) === null;
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
    const response = await workosProxy(request, event);
    return applyLocaleToResponse(response, locale);
  }

  if (locale && isProtectedLocalizedPath(pathnameWithoutLocale)) {
    const response = await workosProxy(request, event);
    return applyLocaleToResponse(response, locale);
  }

  if (!locale && isLocalizedAppPath(pathname)) {
    const nextLocale = getAppLocaleFromRequest(request);
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = pathname === "/" ? `/${nextLocale}` : `/${nextLocale}${pathname}`;
    return NextResponse.redirect(nextUrl);
  }

  return workosProxy(request, event);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|api|mcp|\\.well-known|install).*)",
    "/api/:path*",
  ],
};
