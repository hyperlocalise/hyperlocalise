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

import { applyHtmlIngestTranslations } from "@/lib/projects/files/html-ingest-entries";

import type { HubspotContentClient, HubspotPageRecord } from "./client";
import type { HubspotResourceKind } from "./constants";
import {
  applyPageDocument,
  buildEmailHtmlDocument,
  buildPageDocument,
  emailHtmlKinds,
  hashHubspotContent,
  hubspotDocumentHasCopy,
  readEmailHtmlDocument,
  type HubspotStringTree,
} from "./document";

export const HUBSPOT_PAGE_FILE = "page.html";

const PAGE_FOLDERS = {
  "landing-page": "landing-pages",
  "website-page": "website-pages",
} as const;

export type HubspotPageKind = keyof typeof PAGE_FOLDERS;

export type HubspotPageImportFile = {
  fileName: string;
  sourcePath: string;
  content: string;
  contentType: string;
  fileFormat: "html";
};

function normalizeHubspotPath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/\/+/g, "/");
}

export function isHubspotPageKind(kind: HubspotResourceKind): kind is HubspotPageKind {
  return kind === "landing-page" || kind === "website-page";
}

export function buildHubspotPageSourcePath(kind: HubspotPageKind, pageId: string): string {
  const folder = PAGE_FOLDERS[kind];
  const id = encodeURIComponent(pageId.trim());
  return normalizeHubspotPath(`hubspot/${folder}/${id}/${HUBSPOT_PAGE_FILE}`);
}

export function buildPageHtmlDocument(page: HubspotPageRecord, stylesCss: string): string {
  const tree = buildPageDocument(page);
  if (!hubspotDocumentHasCopy(tree)) {
    return "";
  }
  const kinds = emailHtmlKinds(tree);
  const bodyHtml = buildEmailHtmlDocument(tree, { kinds });
  const css = stylesCss.trim();
  const head = css
    ? `<head>\n<meta charset="utf-8">\n<style data-hl-style="hubspot">${css}</style>\n</head>`
    : `<head>\n<meta charset="utf-8">\n</head>`;
  return bodyHtml.replace(/<html>\s*<body>/i, `<html>\n${head}\n<body>`);
}

export function readPageHtmlDocument(html: string): HubspotStringTree {
  return readEmailHtmlDocument(html);
}

export function splitPageIntoImportFiles(
  kind: HubspotPageKind,
  page: HubspotPageRecord,
  stylesCss: string,
): HubspotPageImportFile[] {
  const content = buildPageHtmlDocument(page, stylesCss);
  if (!content) {
    return [];
  }
  const pageId = page.id.trim();
  return [
    {
      fileName: HUBSPOT_PAGE_FILE,
      sourcePath: buildHubspotPageSourcePath(kind, pageId),
      content,
      contentType: "text/html",
      fileFormat: "html",
    },
  ];
}

export function hashHubspotPageHtml(html: string): string {
  return hashHubspotContent(html);
}

export async function hashRemotePageHtml(
  client: HubspotContentClient,
  kind: HubspotPageKind,
  copyId: string,
): Promise<string> {
  const copy =
    kind === "landing-page"
      ? await client.getLandingPage(copyId)
      : await client.getWebsitePage(copyId);
  let stylesCss = "";
  try {
    stylesCss = await client.collectPageStylesCss({
      templatePath: copy.templatePath,
      attachedStylesheets: copy.attachedStylesheets,
    });
  } catch {
    stylesCss = "";
  }
  return hashHubspotContent(buildPageHtmlDocument(copy, stylesCss));
}

export function pageDraftFieldsFromHtml(input: {
  live: HubspotPageRecord;
  sourceHtml: string;
  prefilled: Record<string, string>;
}): ReturnType<typeof applyPageDocument> {
  const translatedHtml = applyHtmlIngestTranslations(input.sourceHtml, input.prefilled);
  return applyPageDocument(input.live, readPageHtmlDocument(translatedHtml));
}
