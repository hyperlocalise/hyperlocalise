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

export type DocumentHeadMetadataIssue = "title" | "description" | "canonical" | "hreflang";

export type DocumentHeadMetadataReport = {
  ok: boolean;
  issues: DocumentHeadMetadataIssue[];
};

function findHeadEndIndex(html: string): number {
  const index = html.toLowerCase().indexOf("</head>");
  return index >= 0 ? index : html.length;
}

/** Validates that core SEO tags are present in `<head>`, not deferred into `<body>`. */
export function getDocumentHeadMetadataReport(html: string): DocumentHeadMetadataReport {
  const headEnd = findHeadEndIndex(html);
  const head = html.slice(0, headEnd);
  const body = html.slice(headEnd);

  const issues: DocumentHeadMetadataIssue[] = [];

  const titleInHead = /<title\b[^>]*>[\s\S]*?<\/title>/i.test(head);
  const titleInBody = /<title\b[^>]*>[\s\S]*?<\/title>/i.test(body);
  if (!titleInHead || titleInBody) {
    issues.push("title");
  }

  const descriptionInHead = /<meta\b[^>]*\bname=["']description["']/i.test(head);
  const descriptionInBody = /<meta\b[^>]*\bname=["']description["']/i.test(body);
  if (!descriptionInHead || descriptionInBody) {
    issues.push("description");
  }

  const canonicalInHead = /<link\b[^>]*\brel=["']canonical["']/i.test(head);
  const canonicalInBody = /<link\b[^>]*\brel=["']canonical["']/i.test(body);
  if (!canonicalInHead || canonicalInBody) {
    issues.push("canonical");
  }

  const hreflangInHead = /<link\b[^>]*\bhreflang=/i.test(head);
  const hreflangInBody = /<link\b[^>]*\bhreflang=/i.test(body);
  if (!hreflangInHead || hreflangInBody) {
    issues.push("hreflang");
  }

  return { ok: issues.length === 0, issues };
}
