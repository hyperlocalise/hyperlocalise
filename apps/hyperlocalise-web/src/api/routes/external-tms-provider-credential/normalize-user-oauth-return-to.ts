import { normalizeAppLocale } from "@/lib/app-i18n/locales";

const RELATIVE_URL_BASE = "https://app.hyperlocalise.local";

function stripOptionalAppLocalePrefix(pathname: string): string {
  const [, firstSegment, ...rest] = pathname.split("/");
  const locale = firstSegment ? normalizeAppLocale(firstSegment) : null;

  if (!locale) {
    return pathname;
  }

  return `/${rest.join("/")}`.replace(/\/+$/, "") || "/";
}

export function normalizeUserOAuthReturnTo(
  value: string | null | undefined,
  organizationSlug: string,
): string {
  const fallback = `/org/${organizationSlug}/dashboard`;
  const orgRoot = `/org/${organizationSlug}`;

  if (!value?.trim()) {
    return fallback;
  }

  try {
    const url = new URL(value, RELATIVE_URL_BASE);
    const normalized = `${url.pathname}${url.search}`;
    const pathWithoutLocale = stripOptionalAppLocalePrefix(url.pathname);

    if (pathWithoutLocale === orgRoot || pathWithoutLocale.startsWith(`${orgRoot}/`)) {
      if (pathWithoutLocale === orgRoot) {
        return fallback;
      }
      return normalized;
    }
  } catch {
    return fallback;
  }

  return fallback;
}
