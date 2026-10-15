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

/** Whether stored HTML is a full document rather than a body fragment. */
export function isFullHtmlDocument(html: string): boolean {
  const trimmed = html.trimStart();
  return /^<!DOCTYPE/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);
}

/** Serialize an iframe document after designMode edits. */
export function serializeDesignModeDocument(doc: Document, asFullDocument: boolean): string {
  if (asFullDocument) {
    const doctype = doc.doctype;
    const prefix = doctype
      ? `<!DOCTYPE ${doctype.name}${doctype.publicId ? ` PUBLIC "${doctype.publicId}"` : ""}${doctype.systemId ? ` "${doctype.systemId}"` : ""}>`
      : "";
    return `${prefix}${doc.documentElement.outerHTML}`;
  }
  return doc.body?.innerHTML ?? "";
}
