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
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";

import { hashBrazeContent } from "./html-envelope";
import { slugifyBrazePathSegment } from "./names";

export type BrazeTranslationMap = Record<string, string>;

export function isBrazeTranslationMap(value: unknown): value is BrazeTranslationMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === "string");
}

export function readBrazeTranslationMap(value: unknown): BrazeTranslationMap {
  if (!isBrazeTranslationMap(value)) {
    return {};
  }
  const map: BrazeTranslationMap = {};
  for (const [key, text] of Object.entries(value)) {
    const trimmedKey = key.trim();
    if (trimmedKey) {
      map[trimmedKey] = text;
    }
  }
  return map;
}

export function serializeBrazeTranslationMap(map: BrazeTranslationMap): string {
  const sorted = Object.fromEntries(
    Object.entries(map).toSorted(([left], [right]) => left.localeCompare(right)),
  );
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

export function parseBrazeTranslationMapJson(text: string): BrazeTranslationMap {
  const parsed = safeJsonParse(text);
  if (!parsed.ok) {
    return {};
  }
  return readBrazeTranslationMap(parsed.value);
}

export function hashBrazeTranslationMap(map: BrazeTranslationMap): string {
  return hashBrazeContent(serializeBrazeTranslationMap(map));
}

function brazeSourcePathToken(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 8);
}

export function buildBrazeCampaignSourcePath(input: {
  campaignId: string;
  campaignName?: string | null;
  messageVariationId: string;
  variationName?: string | null;
}): string {
  const campaignSlug = slugifyBrazePathSegment(input.campaignName ?? "", input.campaignId);
  const variationSlug = slugifyBrazePathSegment(
    input.variationName ?? "",
    input.messageVariationId,
  );
  return normalizeSourcePath(
    `braze/campaigns/${campaignSlug}-${brazeSourcePathToken(input.campaignId)}/${variationSlug}-${brazeSourcePathToken(input.messageVariationId)}.json`,
  );
}

export function buildBrazeCanvasSourcePath(input: {
  workflowId: string;
  canvasName?: string | null;
  stepId: string;
  stepName?: string | null;
  messageVariationId: string;
  variationName?: string | null;
}): string {
  const canvasSlug = slugifyBrazePathSegment(input.canvasName ?? "", input.workflowId);
  const stepSlug = slugifyBrazePathSegment(input.stepName ?? "", input.stepId);
  const variationSlug = slugifyBrazePathSegment(
    input.variationName ?? "",
    input.messageVariationId,
  );
  return normalizeSourcePath(
    `braze/canvas/${canvasSlug}-${brazeSourcePathToken(input.workflowId)}/${stepSlug}-${brazeSourcePathToken(input.stepId)}/${variationSlug}-${brazeSourcePathToken(input.messageVariationId)}.json`,
  );
}

export function isBrazeCampaignSourcePath(sourcePath: string): boolean {
  return sourcePath.startsWith("braze/campaigns/") || sourcePath.startsWith("braze/canvas/");
}

export function isBrazeTemplateSourcePath(sourcePath: string): boolean {
  return (
    sourcePath.startsWith("braze/templates/") || sourcePath.startsWith("braze/content-blocks/")
  );
}
