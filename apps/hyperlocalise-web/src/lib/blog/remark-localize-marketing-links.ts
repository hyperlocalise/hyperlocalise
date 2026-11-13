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
import { rewriteAppLocalePath } from "@/lib/app-i18n/rewrite-app-locale-path";
import type { AppLocale } from "@/lib/app-i18n/locales";

function shouldLocalizeMarketingLink(url: string): boolean {
  if (!url.startsWith("/")) {
    return false;
  }
  if (url.startsWith("//")) {
    return false;
  }
  return true;
}

function localizeUrl(url: string, locale: AppLocale): string {
  if (!shouldLocalizeMarketingLink(url)) {
    return url;
  }
  return rewriteAppLocalePath(url, locale);
}

type MdastNode = {
  type?: string;
  url?: string;
  children?: MdastNode[];
};

function visitMdast(node: MdastNode | undefined, locale: AppLocale): void {
  if (!node) {
    return;
  }

  if (node.type === "link" || node.type === "definition") {
    if (typeof node.url === "string") {
      node.url = localizeUrl(node.url, locale);
    }
  }

  for (const child of node.children ?? []) {
    visitMdast(child, locale);
  }
}

/** Prefixes root-relative marketing links with the active `/[lang]` segment at render time. */
export function remarkLocalizeMarketingLinks(locale: AppLocale) {
  return () => (tree: MdastNode) => {
    visitMdast(tree, locale);
  };
}
