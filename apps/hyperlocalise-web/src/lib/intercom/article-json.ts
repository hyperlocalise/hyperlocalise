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

export function buildIntercomArticleSourcePath(input: {
  helpCenterId: string;
  articleId: string;
}): string {
  const helpCenterId = input.helpCenterId.trim();
  const articleId = input.articleId.trim();
  return normalizeSourcePath(`intercom/${helpCenterId}/${articleId}.json`);
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
