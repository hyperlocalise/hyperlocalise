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
import type {
  GuidelineRetrieveRequest,
  GuidelineRetrieveResult,
} from "@/lib/go-svc/go-svc-guidelines-api";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-request";
import { createGoSvcServerClient } from "@/lib/go-svc/go-svc-server-client";

import { truncateToBudget } from "./knowledge-memory-excerpt";

export const UPLOADED_GUIDELINES_CONTEXT_MAX_LENGTH = 6_000;
export const UPLOADED_GUIDELINES_PASSAGE_LIMIT = 8;
/** go-svc retrieves once per locale; larger jobs get locale-independent documents only. */
export const UPLOADED_GUIDELINES_MAX_LOCALES = 8;
/** go-svc rejects queries over 16,000 bytes; 4,000 UTF-16 units stays under it. */
const QUERY_MAX_CHARS = 4_000;
const RETRIEVE_TIMEOUT_MS = 5_000;
const MIN_SECTION_CHARS = 200;

type RetrieveUploadedGuidelines = (
  organizationId: string,
  body: GuidelineRetrieveRequest,
  options: { signal: AbortSignal },
) => Promise<GuidelineRetrieveResult>;

const retrieveFromGoSvc: RetrieveUploadedGuidelines = (organizationId, body, options) =>
  createGoSvcServerClient().guidelines.internalRetrieve(organizationId, body, options);

function sectionHeading(document: { title: string; locale?: string }) {
  const title = document.title.trim() || "Untitled guideline";
  return document.locale ? `### ${title} (${document.locale} only)` : `### ${title}`;
}

/**
 * Mandatory documents come first in full, then search passages grouped by document,
 * all within maxChars. Sections that no longer fit are dropped.
 */
export function formatUploadedGuidelines(
  result: GuidelineRetrieveResult,
  maxChars = UPLOADED_GUIDELINES_CONTEXT_MAX_LENGTH,
): string {
  const passagesByDocument = new Map<string, string[]>();
  for (const passage of result.passages) {
    const texts = passagesByDocument.get(passage.documentId) ?? [];
    texts.push(passage.text.trim());
    passagesByDocument.set(passage.documentId, texts);
  }

  const ordered = [
    ...result.documents.filter((document) => document.mandatory),
    ...result.documents.filter((document) => !document.mandatory),
  ];
  const sections: string[] = [];
  let remaining = maxChars;
  for (const document of ordered) {
    const body = document.mandatory
      ? (document.content ?? "").trim()
      : (passagesByDocument.get(document.id) ?? []).filter(Boolean).join("\n\n");
    if (!body) {
      continue;
    }
    const heading = sectionHeading(document);
    const separator = sections.length > 0 ? 2 : 0;
    const available = remaining - separator - heading.length - 1;
    if (available < MIN_SECTION_CHARS) {
      break;
    }
    const section = `${heading}\n${truncateToBudget(body, available)}`;
    sections.push(section);
    remaining -= separator + section.length;
  }
  return sections.join("\n\n");
}

/**
 * Best effort: translation continues with typed guidelines when go-svc is
 * unavailable, so failures resolve to an empty string.
 */
export async function loadUploadedGuidelinesContext(
  input: {
    organizationId: string;
    projectId: string;
    targetLocales: string[];
    sourceText: string;
  },
  retrieve: RetrieveUploadedGuidelines = retrieveFromGoSvc,
): Promise<string> {
  const locales =
    input.targetLocales.length <= UPLOADED_GUIDELINES_MAX_LOCALES ? input.targetLocales : [];
  try {
    const result = await retrieve(
      input.organizationId,
      {
        projectId: input.projectId,
        locales,
        query: input.sourceText.slice(0, QUERY_MAX_CHARS),
        limit: UPLOADED_GUIDELINES_PASSAGE_LIMIT,
      },
      { signal: AbortSignal.timeout(RETRIEVE_TIMEOUT_MS) },
    );
    return formatUploadedGuidelines(result);
  } catch (error) {
    console.warn("[translation-context] uploaded guideline retrieval failed", {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code: error instanceof GoSvcClientError ? error.code : undefined,
      status: error instanceof GoSvcClientError ? error.status : undefined,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return "";
  }
}
