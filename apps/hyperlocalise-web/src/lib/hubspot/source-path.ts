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

import type { HubspotResourceKind } from "./constants";

/**
 * Client-safe path helpers. Do not import `@/lib/file-storage/records` here:
 * that module pulls in the server-only database client and breaks the content
 * editor bundle. This matches `normalizeSourcePath` in that module.
 */
function normalizeSourcePath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/\/+/g, "/");
}

const HUBSPOT_PATH =
  /^hubspot\/(emails|forms|blog-posts|landing-pages|website-pages|message-templates)\/([^/]+)\/([^/]+)\.(json|html)$/;

const HUBSPOT_FOLDERS = {
  email: "emails",
  form: "forms",
  blog: "blog-posts",
  "landing-page": "landing-pages",
  "website-page": "website-pages",
  "message-template": "message-templates",
} as const;

export function isHubspotSourcePath(sourcePath: string): boolean {
  return sourcePath === "hubspot/" || sourcePath.startsWith("hubspot/");
}

function slugifyHubspotPathSegment(name: string, fallback: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback.trim() || "item";
}

export function buildHubspotSourcePath(input: {
  kind: HubspotResourceKind;
  id: string;
  name?: string | null;
}): string {
  const folder = HUBSPOT_FOLDERS[input.kind];
  const extension = input.kind === "blog" || input.kind === "message-template" ? "html" : "json";
  const id = encodeURIComponent(input.id.trim());
  const slug = slugifyHubspotPathSegment(input.name ?? "", "item");
  return normalizeSourcePath(`hubspot/${folder}/${id}/${slug}.${extension}`);
}

export function parseHubspotSourcePath(sourcePath: string): {
  kind: HubspotResourceKind;
  id: string;
} | null {
  const match = HUBSPOT_PATH.exec(sourcePath.trim());
  if (!match) {
    return null;
  }
  const folder = match[1];
  const id = decodeURIComponent(match[2] ?? "");
  if (!id) {
    return null;
  }
  const kind = (Object.entries(HUBSPOT_FOLDERS).find(([, value]) => value === folder)?.[0] ??
    "email") as HubspotResourceKind;
  return { kind, id };
}
