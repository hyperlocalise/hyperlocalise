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
import { normalizeAppLocale } from "@/lib/app-i18n/locales";

const ORG_PATH_PATTERN = /^\/org(?:[/?#]|$)/;

/**
 * Prefixes an `/org` path with the current page's locale. Without it the proxy answers with a
 * locale redirect, which costs client navigations and prefetches an extra server request.
 */
export function localizeOrgHref(href: string, currentPathname: string | null): string {
  if (!ORG_PATH_PATTERN.test(href)) {
    return href;
  }

  const firstSegment = currentPathname?.split("/")[1];
  const locale = firstSegment ? normalizeAppLocale(firstSegment) : null;

  return locale ? `/${locale}${href}` : href;
}
