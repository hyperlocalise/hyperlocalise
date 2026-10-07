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
