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

import type { HubspotBlogRecord } from "./client";
import {
  blogRssBodyIsDistinctCopy,
  buildBlogContentDocument,
  buildEmailHtmlDocument,
  emailHtmlKinds,
  hubspotDocumentHasCopy,
  readEmailHtmlDocument,
  type HubspotStringTree,
} from "./document";
import { hashHubspotContent } from "./document-hash";

export const HUBSPOT_BLOG_POST_FILE = "post.html";

export type HubspotBlogImportFile = {
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

export function buildHubspotBlogFolderPath(postId: string): string {
  const id = encodeURIComponent(postId.trim());
  return normalizeHubspotPath(`hubspot/blog-posts/${id}`);
}

export function buildHubspotBlogPostSourcePath(postId: string): string {
  return `${buildHubspotBlogFolderPath(postId)}/${HUBSPOT_BLOG_POST_FILE}`;
}

/** @deprecated Use buildHubspotBlogPostSourcePath */
export function buildHubspotBlogSiblingPath(postId: string, fileName: string): string {
  return `${buildHubspotBlogFolderPath(postId)}/${fileName}`;
}

export function hubspotBlogSyncSourcePath(postId: string): string {
  return buildHubspotBlogFolderPath(postId);
}

export function shouldImportRssBody(postBody: string, rssBody: string): boolean {
  return blogRssBodyIsDistinctCopy(postBody, rssBody);
}

function blogImportTree(post: HubspotBlogRecord): HubspotStringTree {
  const document = buildBlogContentDocument(post);
  if (!shouldImportRssBody(post.postBody, post.rssBody)) {
    delete document.rssBody;
  }
  return document;
}

export function buildBlogPostHtmlDocument(post: HubspotBlogRecord, stylesCss: string): string {
  const tree = blogImportTree(post);
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

export function readBlogPostHtmlDocument(html: string): HubspotStringTree {
  return readEmailHtmlDocument(html);
}

export function splitBlogPostIntoImportFiles(
  post: HubspotBlogRecord,
  stylesCss: string,
): HubspotBlogImportFile[] {
  const content = buildBlogPostHtmlDocument(post, stylesCss);
  if (!content) {
    return [];
  }
  const postId = post.id.trim();
  return [
    {
      fileName: HUBSPOT_BLOG_POST_FILE,
      sourcePath: buildHubspotBlogPostSourcePath(postId),
      content,
      contentType: "text/html",
      fileFormat: "html",
    },
  ];
}

export function hashHubspotBlogImportBundle(files: readonly HubspotBlogImportFile[]): string {
  const parts = [...files]
    .sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))
    .map((file) => `${file.sourcePath}\n${file.content}`);
  return hashHubspotContent(parts.join("\n---\n"));
}
