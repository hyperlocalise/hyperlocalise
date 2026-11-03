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

import { HUBSPOT_EMAIL_PREVIEW_STYLE_MARKER } from "./content-editor-hubspot-email-preview";

function skipLeadingHtmlComments(html: string): string {
  let rest = html.trimStart();
  while (rest.startsWith("<!--")) {
    const end = rest.indexOf("-->");
    if (end === -1) {
      break;
    }
    rest = rest.slice(end + 3).trimStart();
  }
  return rest;
}

/** Whether stored HTML is a full document rather than a body fragment. */
export function isFullHtmlDocument(html: string): boolean {
  const trimmed = skipLeadingHtmlComments(html);
  return /^<!DOCTYPE/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);
}

function serializeDoctype(doctype: DocumentType): string {
  let serialized = `<!DOCTYPE ${doctype.name}`;
  if (doctype.publicId) {
    serialized += ` PUBLIC "${doctype.publicId}"`;
    if (doctype.systemId) {
      serialized += ` "${doctype.systemId}"`;
    }
  } else if (doctype.systemId) {
    serialized += ` SYSTEM "${doctype.systemId}"`;
  }
  return `${serialized}>`;
}

/** Serialize an iframe document after designMode edits. Preview-only canvas
 * stylesheets (see `HUBSPOT_EMAIL_PREVIEW_STYLE_MARKER`) are stripped from a
 * clone so the live preview keeps its styling while saved files stay clean. */
export function serializeDesignModeDocument(doc: Document, asFullDocument: boolean): string {
  const root = withoutPreviewStyles(doc.documentElement);
  if (asFullDocument) {
    const doctype = doc.doctype;
    const prefix = doctype ? serializeDoctype(doctype) : "";
    return `${prefix}${root.outerHTML}`;
  }
  const headHtml = root.querySelector("head")?.innerHTML ?? "";
  const bodyHtml = root.querySelector("body")?.innerHTML ?? "";
  return headHtml ? `${headHtml}${bodyHtml}` : bodyHtml;
}

function withoutPreviewStyles(root: HTMLElement): HTMLElement {
  if (root.querySelector(`style[${HUBSPOT_EMAIL_PREVIEW_STYLE_MARKER}]`) == null) {
    return root;
  }
  const clone = root.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(`style[${HUBSPOT_EMAIL_PREVIEW_STYLE_MARKER}]`)
    .forEach((el) => el.remove());
  return clone;
}
