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
import { createHash } from "node:crypto";

import { normalizeSourcePath } from "@/lib/file-storage/records";

export const INTERCOM_ARTICLE_JSON_KEYS = ["title", "description", "body"] as const;

export type IntercomArticleJsonPayload = {
  title: string;
  description: string;
  body: string;
};

export function slugifyIntercomPathSegment(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback.trim() || "item";
}

export function buildIntercomArticleSourcePath(input: {
  helpCenterId: string;
  articleId: string;
  helpCenterName?: string | null;
  articleTitle?: string | null;
}): string {
  const helpCenterId = input.helpCenterId.trim();
  const articleId = input.articleId.trim();
  const helpCenterSlug = slugifyIntercomPathSegment(input.helpCenterName ?? "", helpCenterId);
  const articleSlug = slugifyIntercomPathSegment(input.articleTitle ?? "", articleId);
  return normalizeSourcePath(`intercom/${helpCenterSlug}/${articleSlug}.json`);
}

export type IntercomArticlePathAssignment = {
  id: string;
  title?: string | null;
};

export type IntercomPersistedArticlePath = {
  articleId: string;
  sourcePath: string;
  status?: string | null;
};

function sourcePathFilename(sourcePath: string): string {
  const separator = sourcePath.lastIndexOf("/");
  return separator === -1 ? sourcePath : sourcePath.slice(separator + 1);
}

export function assignIntercomArticleSourcePaths(input: {
  helpCenterId: string;
  helpCenterName?: string | null;
  articles: readonly IntercomArticlePathAssignment[];
  existingMappings?: readonly IntercomPersistedArticlePath[];
}): Map<string, string> {
  const existingByArticleId = new Map(
    (input.existingMappings ?? []).map((mapping) => [mapping.articleId, mapping.sourcePath]),
  );
  const usedFilenames = new Set(
    (input.existingMappings ?? [])
      .filter((mapping) => mapping.status !== "archived")
      .map((mapping) => sourcePathFilename(mapping.sourcePath)),
  );
  const sourcePathByArticleId = new Map<string, string>();

  for (const article of input.articles) {
    const existingPath = existingByArticleId.get(article.id);
    if (existingPath) {
      usedFilenames.add(sourcePathFilename(existingPath));
      sourcePathByArticleId.set(article.id, existingPath);
      continue;
    }

    let sourcePath = buildIntercomArticleSourcePath({
      helpCenterId: input.helpCenterId,
      articleId: article.id,
      helpCenterName: input.helpCenterName,
      articleTitle: article.title,
    });
    if (usedFilenames.has(sourcePathFilename(sourcePath))) {
      sourcePath = buildIntercomArticleSourcePath({
        helpCenterId: input.helpCenterId,
        articleId: article.id,
        helpCenterName: input.helpCenterName,
        articleTitle: `${article.title ?? ""}-${article.id}`,
      });
    }
    usedFilenames.add(sourcePathFilename(sourcePath));
    sourcePathByArticleId.set(article.id, sourcePath);
  }

  return sourcePathByArticleId;
}

export function serializeIntercomArticleJson(payload: IntercomArticleJsonPayload): string {
  return `${JSON.stringify(
    {
      title: payload.title,
      description: payload.description,
      body: payload.body,
    },
    null,
    2,
  )}\n`;
}

export function hashIntercomArticleContent(payload: IntercomArticleJsonPayload): string {
  return hashIntercomTranslationValues(payload);
}

export function hashIntercomTranslationValues(values: {
  title?: string;
  description?: string;
  body?: string;
}): string {
  const canonical = JSON.stringify({
    title: values.title ?? "",
    description: values.description ?? "",
    body: values.body ?? "",
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

const INTERCOM_CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function encodeIntercomLastPushRecord(hash: string, pushedAtSeconds: number): string {
  return `${hash}:${pushedAtSeconds}`;
}

export function shouldSkipUnchangedIntercomHash(input: {
  lastHash: string;
  nextHash: string;
  overwriteIntercomDrafts: boolean;
}): boolean {
  return input.lastHash === input.nextHash && !input.overwriteIntercomDrafts;
}

export function parseIntercomLastPushRecord(value: string | undefined): {
  hash: string;
  pushedAtSeconds: number | null;
} {
  if (!value) {
    return { hash: "", pushedAtSeconds: null };
  }
  const separatorIndex = value.indexOf(":");
  if (separatorIndex === 64 && INTERCOM_CONTENT_HASH_PATTERN.test(value.slice(0, 64))) {
    const pushedAtSeconds = Number(value.slice(65));
    return {
      hash: value.slice(0, 64),
      pushedAtSeconds: Number.isFinite(pushedAtSeconds) ? pushedAtSeconds : null,
    };
  }
  return { hash: value, pushedAtSeconds: null };
}

export function collectApprovedIntercomArticleValues(
  prefilled: Record<string, string>,
): Partial<IntercomArticleJsonPayload> {
  const values: Partial<IntercomArticleJsonPayload> = {};
  for (const key of INTERCOM_ARTICLE_JSON_KEYS) {
    const translated = prefilled[key];
    if (typeof translated === "string" && translated.trim().length > 0) {
      values[key] = translated;
    }
  }
  return values;
}

export function mergeIntercomLocalePushPayload(input: {
  approved: Partial<IntercomArticleJsonPayload>;
  remote?: Partial<IntercomArticleJsonPayload> | null;
}): IntercomArticleJsonPayload | null {
  if (Object.keys(input.approved).length === 0) {
    return null;
  }

  const title = input.approved.title?.trim() ?? "";
  const body = input.approved.body?.trim() ?? "";
  if (!title || !body) {
    return null;
  }

  return {
    title,
    description: input.approved.description ?? input.remote?.description ?? "",
    body: input.approved.body ?? "",
  };
}

export function articleFieldsToJsonPayload(input: {
  title?: string | null;
  description?: string | null;
  body?: string | null;
}): IntercomArticleJsonPayload {
  return {
    title: input.title?.trim() ?? "",
    description: input.description?.trim() ?? "",
    body: input.body ?? "",
  };
}
