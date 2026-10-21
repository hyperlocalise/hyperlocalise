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
import type { UploadedGuidelineUse } from "@/lib/translation/generation-provenance";

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

function omittedMandatoryNotice(count: number) {
  return `### Mandatory guidelines omitted\n${count} mandatory guideline document(s) did not fit the context budget and are not included. The mandatory guidelines above are incomplete.`;
}

export type FormattedUploadedGuidelines = {
  text: string;
  /** Documents with a section in `text`, in prompt order. */
  includedDocumentIds: string[];
  omittedMandatoryDocumentIds: string[];
};

export type UploadedGuidelinesContext = {
  text: string;
  documents: UploadedGuidelineUse[];
};

const NO_UPLOADED_GUIDELINES: UploadedGuidelinesContext = { text: "", documents: [] };

/**
 * Mandatory documents are included whole or omitted, never truncated; omissions
 * are stated in the text. Search passages grouped by document fill the rest of
 * maxChars, and passage sections that no longer fit are truncated or dropped.
 */
export function formatUploadedGuidelines(
  result: GuidelineRetrieveResult,
  maxChars = UPLOADED_GUIDELINES_CONTEXT_MAX_LENGTH,
): FormattedUploadedGuidelines {
  const passagesByDocument = new Map<string, string[]>();
  for (const passage of result.passages) {
    const texts = passagesByDocument.get(passage.documentId) ?? [];
    texts.push(passage.text.trim());
    passagesByDocument.set(passage.documentId, texts);
  }

  const sections: string[] = [];
  const includedDocumentIds: string[] = [];
  let remaining = maxChars;
  const separator = () => (sections.length > 0 ? 2 : 0);
  const push = (section: string, documentId?: string) => {
    remaining -= separator() + section.length;
    sections.push(section);
    if (documentId) includedDocumentIds.push(documentId);
  };

  const mandatory = result.documents.flatMap((document) => {
    const body = document.mandatory ? (document.content ?? "").trim() : "";
    return body ? [{ id: document.id, section: `${sectionHeading(document)}\n${body}` }] : [];
  });
  const mandatoryLength = mandatory.reduce(
    (total, { section }, index) => total + section.length + (index > 0 ? 2 : 0),
    0,
  );
  const noticeReserve =
    mandatoryLength > maxChars ? omittedMandatoryNotice(mandatory.length).length + 2 : 0;
  remaining -= noticeReserve;
  const omittedMandatoryDocumentIds: string[] = [];
  for (const { id, section } of mandatory) {
    if (separator() + section.length > remaining) {
      omittedMandatoryDocumentIds.push(id);
      continue;
    }
    push(section, id);
  }
  remaining += noticeReserve;
  if (omittedMandatoryDocumentIds.length > 0) {
    push(omittedMandatoryNotice(omittedMandatoryDocumentIds.length));
  }

  for (const document of result.documents) {
    if (document.mandatory) {
      continue;
    }
    const body = (passagesByDocument.get(document.id) ?? []).filter(Boolean).join("\n\n");
    if (!body) {
      continue;
    }
    const heading = sectionHeading(document);
    const available = remaining - separator() - heading.length - 1;
    if (available < MIN_SECTION_CHARS) {
      break;
    }
    push(`${heading}\n${truncateToBudget(body, available)}`, document.id);
  }
  return { text: sections.join("\n\n"), includedDocumentIds, omittedMandatoryDocumentIds };
}

function uploadedGuidelineUses(
  result: GuidelineRetrieveResult,
  formatted: FormattedUploadedGuidelines,
): UploadedGuidelineUse[] {
  const byId = new Map(result.documents.map((document) => [document.id, document]));
  const use = (id: string, omitted: boolean): UploadedGuidelineUse[] => {
    const document = byId.get(id);
    if (!document) return [];
    return [
      {
        documentId: document.id,
        revisionId: document.revisionId,
        version: document.version,
        title: document.title,
        mandatory: document.mandatory,
        ...(document.locale ? { locale: document.locale } : {}),
        ...(omitted ? { omitted: true as const } : {}),
      },
    ];
  };
  return [
    ...formatted.includedDocumentIds.flatMap((id) => use(id, false)),
    ...formatted.omittedMandatoryDocumentIds.flatMap((id) => use(id, true)),
  ];
}

/**
 * Best effort: translation continues with typed guidelines when go-svc is
 * unavailable, so failures resolve to no text and no documents.
 */
export async function loadUploadedGuidelinesContext(
  input: {
    organizationId: string;
    projectId: string;
    targetLocales: string[];
    sourceText: string;
  },
  retrieve: RetrieveUploadedGuidelines = retrieveFromGoSvc,
): Promise<UploadedGuidelinesContext> {
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
    const formatted = formatUploadedGuidelines(result);
    if (formatted.omittedMandatoryDocumentIds.length > 0) {
      console.warn("[translation-context] mandatory uploaded guidelines exceed context budget", {
        organizationId: input.organizationId,
        projectId: input.projectId,
        omittedDocumentIds: formatted.omittedMandatoryDocumentIds,
        maxLength: UPLOADED_GUIDELINES_CONTEXT_MAX_LENGTH,
      });
    }
    return { text: formatted.text, documents: uploadedGuidelineUses(result, formatted) };
  } catch (error) {
    console.warn("[translation-context] uploaded guideline retrieval failed", {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code: error instanceof GoSvcClientError ? error.code : undefined,
      status: error instanceof GoSvcClientError ? error.status : undefined,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return NO_UPLOADED_GUIDELINES;
  }
}
