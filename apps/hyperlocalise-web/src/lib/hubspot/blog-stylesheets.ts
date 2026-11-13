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

import { isHubspotJsonObject, type HubspotJson } from "./document";
import { resolveTemplatePath } from "./template-copy";

const STYLESHEET_FILE_LIMIT = 12;

const REQUIRE_CSS_PATH = /\{%\s*require_css\s+["']([^"']+)["']\s*%\}/g;
const REQUIRE_CSS_BLOCK = /\{%\s*require_css\s*%\}([\s\S]*?)\{%\s*end_require_css\s*%\}/g;
const LINK_STYLESHEET = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi;
const LINK_STYLESHEET_HREF_FIRST = /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']stylesheet["']/gi;

type StylesSdk = {
  apiRequest?: (options: {
    method: string;
    path: string;
    headers?: Record<string, string>;
  }) => Promise<{ ok: boolean; text: () => Promise<string> }>;
};

function stylesheetPathFromAttached(entry: HubspotJson): string | null {
  if (typeof entry === "string" && entry.trim()) {
    return entry.trim();
  }
  if (!isHubspotJsonObject(entry)) {
    return null;
  }
  for (const key of ["path", "href", "url"]) {
    const value = entry[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

async function readDesignManagerFile(sdk: StylesSdk, path: string): Promise<string | null> {
  if (!sdk.apiRequest) {
    return null;
  }
  const normalized = path.replace(/^\/+/, "");
  for (const environment of ["published", "draft"]) {
    const response = await sdk.apiRequest({
      method: "GET",
      path: `/cms/v3/source-code/${environment}/content/${encodeURI(normalized)}`,
      headers: { Accept: "application/octet-stream" },
    });
    const text = await response.text();
    if (!response.ok || !text.trim()) {
      continue;
    }
    const trimmed = text.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed: HubspotJson = JSON.parse(trimmed);
        if (isHubspotJsonObject(parsed) && typeof parsed.source === "string") {
          return parsed.source;
        }
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  return null;
}

function enqueueStylesheetFile(
  fromPath: string,
  href: string,
  fileQueue: string[],
  loadedFiles: Set<string>,
) {
  const resolved = resolveTemplatePath(fromPath, href).replace(/^\/+/, "");
  if (!loadedFiles.has(resolved)) {
    fileQueue.push(resolved);
  }
}

function collectPathsFromHubL(
  source: string,
  fromPath: string,
  fileQueue: string[],
  loadedFiles: Set<string>,
  chunks: string[],
) {
  REQUIRE_CSS_PATH.lastIndex = 0;
  for (const match of source.matchAll(REQUIRE_CSS_PATH)) {
    const href = match[1]?.trim();
    if (href) {
      enqueueStylesheetFile(fromPath, href, fileQueue, loadedFiles);
    }
  }
  REQUIRE_CSS_BLOCK.lastIndex = 0;
  for (const match of source.matchAll(REQUIRE_CSS_BLOCK)) {
    const block = match[1]?.trim();
    if (block) {
      chunks.push(`/* inline from ${fromPath} */\n${block}`);
    }
  }
  for (const pattern of [LINK_STYLESHEET, LINK_STYLESHEET_HREF_FIRST]) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const href = match[1]?.trim();
      if (href && !href.startsWith("http")) {
        enqueueStylesheetFile(fromPath, href, fileQueue, loadedFiles);
      }
    }
  }
}

export async function collectBlogPostStylesCss(
  sdk: StylesSdk,
  input: {
    templatePath?: string | null;
    attachedStylesheets?: HubspotJson[] | null;
  },
): Promise<string> {
  const chunks: string[] = [];
  const fileQueue: string[] = [];
  const loadedFiles = new Set<string>();

  const templatePath = input.templatePath?.replace(/^\/+/, "").trim();
  if (templatePath) {
    fileQueue.push(templatePath);
  }

  for (const entry of input.attachedStylesheets ?? []) {
    const path = stylesheetPathFromAttached(entry);
    if (path) {
      fileQueue.push(path.replace(/^\/+/, ""));
    }
  }

  while (fileQueue.length > 0 && loadedFiles.size < STYLESHEET_FILE_LIMIT) {
    const path = fileQueue.shift()?.replace(/^\/+/, "");
    if (!path || loadedFiles.has(path)) {
      continue;
    }
    loadedFiles.add(path);
    const source = await readDesignManagerFile(sdk, path);
    if (!source) {
      continue;
    }
    if (path.endsWith(".css")) {
      chunks.push(source);
      continue;
    }
    collectPathsFromHubL(source, path, fileQueue, loadedFiles, chunks);
  }

  return chunks.join("\n\n");
}
