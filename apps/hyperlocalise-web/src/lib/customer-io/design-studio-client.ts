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
import { customerIoErrorForResponse } from "./client";
import {
  resolveCustomerIoBaseUrl,
  type CustomerIoRegion,
  type CustomerIoResourceKind,
} from "./constants";

/**
 * Customer.io Design Studio API client (email translations).
 *
 * Campaign/broadcast/newsletter/transactional emails built in Design Studio
 * cannot be updated through the App API translation endpoints (`PUT
 * .../language/{language}` returns 400 "Cannot update content managed by
 * Design Studio"). Their translations live on the linked Design Studio email
 * instead:
 * - `GET /v1/design_studio/emails` (list, `is_linked` filter)
 * - `GET /v1/design_studio/emails/{id}` (default-language content)
 * - `GET|POST /v1/design_studio/emails/{id}/languages[/{language}]`
 * - `PUT /v1/design_studio/emails/{id}/languages/{language}` (partial update,
 *   204; updating does not publish — publishing stays manual in Customer.io)
 *
 * Design Studio stores component markup (`<x-base><x-section><x-paragraph>…`),
 * not the compiled HTML the App API returns, so ingest must read from here.
 */

export type CustomerIoDesignStudioEmailSummary = {
  id: string;
  name: string;
  isLinked: boolean;
  hasTranslations: boolean;
  updatedAt: string | null;
};

export type CustomerIoDesignStudioEmailContent = {
  subject: string;
  preheaderText: string;
  html: string;
};

export type CustomerIoDesignStudioEmail = {
  id: string;
  name: string;
  availableLanguages: string[];
  content: CustomerIoDesignStudioEmailContent;
  updatedAt: string | null;
};

export type CustomerIoDesignStudioTranslation = {
  language: string;
  availableLanguages: string[];
  content: CustomerIoDesignStudioEmailContent;
  updatedAt: string | null;
};

async function designStudioFetch(input: {
  apiKey: string;
  region: CustomerIoRegion;
  path: string;
  method?: string;
  body?: DesignStudioRequestBody;
  fetchImpl: typeof fetch;
}): Promise<Response> {
  return input.fetchImpl(`${resolveCustomerIoBaseUrl(input.region)}${input.path}`, {
    method: input.method ?? "GET",
    headers: {
      Authorization: `Bearer ${input.apiKey.trim()}`,
      Accept: "application/json",
      ...(input.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
  });
}

type DesignStudioRequestBody =
  | { language: string }
  | { content: CustomerIoDesignStudioTranslationContent };

type DesignStudioListItem = {
  id?: string;
  name?: string;
  is_linked?: boolean;
  has_translations?: boolean;
  updated?: number;
};

type DesignStudioListResponse = {
  emails?: DesignStudioListItem[];
  meta?: { pagination?: { total?: number; limit?: number } };
} | null;

function readDesignStudioSummaries(
  body: DesignStudioListResponse,
): CustomerIoDesignStudioEmailSummary[] {
  const emails = body?.emails;
  if (!Array.isArray(emails)) {
    return [];
  }
  return emails.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    if (typeof item.id !== "string" || !item.id) {
      return [];
    }
    return [
      {
        id: item.id,
        name: typeof item.name === "string" ? item.name : "",
        isLinked: item.is_linked === true,
        hasTranslations: item.has_translations === true,
        updatedAt:
          typeof item.updated === "number" ? new Date(item.updated * 1000).toISOString() : null,
      },
    ];
  });
}

export async function listCustomerIoDesignStudioEmails(input: {
  apiKey: string;
  region: CustomerIoRegion;
  isLinked?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoDesignStudioEmailSummary[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const emails: CustomerIoDesignStudioEmailSummary[] = [];
  let page = 1;
  for (;;) {
    const params = new URLSearchParams({ limit: "1000", page: String(page) });
    if (input.isLinked !== undefined) {
      params.set("is_linked", String(input.isLinked));
    }
    const path = `/design_studio/emails?${params.toString()}`;
    const response = await designStudioFetch({
      apiKey: input.apiKey,
      region: input.region,
      path,
      fetchImpl,
    });
    if (!response.ok) {
      throw await customerIoErrorForResponse(response, path);
    }
    const body = (await response.json().catch(() => null)) as DesignStudioListResponse;
    emails.push(...readDesignStudioSummaries(body));
    const total = body?.meta?.pagination?.total;
    // The list endpoint returns `meta.pagination.total`; stop once every
    // record has been fetched. Without a total, a short page ends paging.
    if (typeof total === "number") {
      if (emails.length >= total || page > 100) {
        break;
      }
    } else {
      break;
    }
    page += 1;
  }
  return emails;
}

type DesignStudioEmailContentPayload = {
  subject?: string;
  preheader_text?: string;
  html?: string;
};

type DesignStudioEmailPayload = {
  id?: string;
  name?: string;
  available_languages?: string[];
  content?: DesignStudioEmailContentPayload;
  language?: string;
  updated?: number;
};

function readDesignStudioContent(
  content: DesignStudioEmailContentPayload | undefined,
): CustomerIoDesignStudioEmailContent {
  return {
    subject: typeof content?.subject === "string" ? content.subject : "",
    preheaderText: typeof content?.preheader_text === "string" ? content.preheader_text : "",
    html: typeof content?.html === "string" ? content.html : "",
  };
}

function readDesignStudioLanguages(value: readonly string[] | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function readDesignStudioEmail(item: DesignStudioEmailPayload): CustomerIoDesignStudioEmail | null {
  if (typeof item.id !== "string" || !item.id) {
    return null;
  }
  return {
    id: item.id,
    name: typeof item.name === "string" ? item.name : "",
    availableLanguages: readDesignStudioLanguages(item.available_languages),
    content: readDesignStudioContent(item.content),
    updatedAt:
      typeof item.updated === "number" ? new Date(item.updated * 1000).toISOString() : null,
  };
}

function readDesignStudioTranslation(
  item: DesignStudioEmailPayload,
  fallbackLanguage: string,
): CustomerIoDesignStudioTranslation | null {
  const language =
    typeof item.language === "string" && item.language ? item.language : fallbackLanguage;
  const email = readDesignStudioEmail({
    ...item,
    id: typeof item.id === "string" ? item.id : "translation",
  });
  if (!email) {
    return null;
  }
  return {
    language,
    availableLanguages: email.availableLanguages,
    content: email.content,
    updatedAt: email.updatedAt,
  };
}

export async function getCustomerIoDesignStudioEmail(input: {
  apiKey: string;
  region: CustomerIoRegion;
  emailId: string;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoDesignStudioEmail | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const path = `/design_studio/emails/${encodeURIComponent(input.emailId)}`;
  const response = await designStudioFetch({
    apiKey: input.apiKey,
    region: input.region,
    path,
    fetchImpl,
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw await customerIoErrorForResponse(response, path);
  }
  const body = (await response.json().catch(() => null)) as {
    email?: DesignStudioEmailPayload;
  } | null;
  const email = body?.email && typeof body.email === "object" ? body.email : null;
  return email ? readDesignStudioEmail(email) : null;
}

export async function getCustomerIoDesignStudioTranslation(input: {
  apiKey: string;
  region: CustomerIoRegion;
  emailId: string;
  language: string;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoDesignStudioTranslation | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const path = `/design_studio/emails/${encodeURIComponent(input.emailId)}/languages/${encodeURIComponent(input.language)}`;
  const response = await designStudioFetch({
    apiKey: input.apiKey,
    region: input.region,
    path,
    fetchImpl,
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw await customerIoErrorForResponse(response, path);
  }
  const body = (await response.json().catch(() => null)) as {
    email_translation?: DesignStudioEmailPayload;
  } | null;
  const translation =
    body?.email_translation && typeof body.email_translation === "object"
      ? body.email_translation
      : null;
  return translation ? readDesignStudioTranslation(translation, input.language) : null;
}

export async function createCustomerIoDesignStudioTranslation(input: {
  apiKey: string;
  region: CustomerIoRegion;
  emailId: string;
  language: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const path = `/design_studio/emails/${encodeURIComponent(input.emailId)}/languages`;
  const response = await designStudioFetch({
    apiKey: input.apiKey,
    region: input.region,
    path,
    method: "POST",
    // Content/envelope/transformers omitted: the new translation inherits the
    // default-language content, which the caller then overwrites with PUT.
    body: { language: input.language },
    fetchImpl,
  });
  if (!response.ok) {
    throw await customerIoErrorForResponse(response, path);
  }
}

export type CustomerIoDesignStudioTranslationContent = {
  subject: string;
  preheader_text: string;
  html: string;
};

export async function updateCustomerIoDesignStudioTranslation(input: {
  apiKey: string;
  region: CustomerIoRegion;
  emailId: string;
  language: string;
  content: CustomerIoDesignStudioTranslationContent;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const path = `/design_studio/emails/${encodeURIComponent(input.emailId)}/languages/${encodeURIComponent(input.language)}`;
  const response = await designStudioFetch({
    apiKey: input.apiKey,
    region: input.region,
    path,
    method: "PUT",
    // Partial update: only `content` travels, so the envelope (sender
    // identity) and transformers stay untouched. This does not publish; the
    // email must still be published in Customer.io to go live.
    body: { content: input.content },
    fetchImpl,
  });
  if (!response.ok) {
    throw await customerIoErrorForResponse(response, path);
  }
}

/**
 * Match a requested language tag against the email's `available_languages`
 * case-insensitively (Customer.io stores them lowercase, e.g. `zh-cn`, while
 * project locales map to tags like `zh-CN`). Returns the remote casing for
 * use in translation GET/PUT paths, or null when the language is missing.
 */
export function matchCustomerIoDesignStudioLanguage(
  availableLanguages: readonly string[],
  language: string,
): string | null {
  const wanted = language.trim().toLowerCase();
  if (!wanted) {
    return null;
  }
  return availableLanguages.find((entry) => entry.trim().toLowerCase() === wanted) ?? null;
}

export type CustomerIoDesignStudioLinkTarget = {
  kind: CustomerIoResourceKind;
  id: string;
  name: string;
};

export type CustomerIoDesignStudioLinkAction = {
  id: string;
  name: string;
  subject?: string;
};

/**
 * Candidate Design Studio email names for a workflow action, in match order.
 * Campaigns and broadcasts prefix the email with the resource name
 * (`"<campaign>: <action>"`); newsletters and transactional messages use the
 * message name itself.
 */
export function customerIoDesignStudioEmailNameCandidates(
  resource: CustomerIoDesignStudioLinkTarget,
  action: CustomerIoDesignStudioLinkAction,
): string[] {
  const actionName = action.name.trim();
  const resourceName = resource.name.trim();
  const prefixed = resourceName && actionName ? `${resourceName}: ${actionName}` : "";
  const candidates =
    resource.kind === "campaign" || resource.kind === "broadcast"
      ? [prefixed, actionName]
      : [resourceName, actionName];
  return [...new Set(candidates.map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
}

function matchCustomerIoDesignStudioEmailsByName<T extends { name: string }>(input: {
  resource: CustomerIoDesignStudioLinkTarget;
  action: CustomerIoDesignStudioLinkAction;
  emails: readonly T[];
}): T[] {
  for (const candidate of customerIoDesignStudioEmailNameCandidates(input.resource, input.action)) {
    const matches = input.emails.filter((email) => email.name.trim() === candidate);
    if (matches.length > 0) {
      return [...matches];
    }
  }
  return [];
}

/**
 * Resolve the Design Studio email linked to a workflow action. The API
 * exposes only `is_linked` (no action reference), so matching is by email
 * name, confirmed by default subject when several emails share a name.
 * Returns null when there is no single match — callers stay on the App API
 * path instead of guessing.
 */
export function resolveCustomerIoDesignStudioEmail<
  T extends { id: string; name: string; subject?: string },
>(input: {
  resource: CustomerIoDesignStudioLinkTarget;
  action: CustomerIoDesignStudioLinkAction;
  emails: readonly T[];
}): T | null {
  const matches = matchCustomerIoDesignStudioEmailsByName(input);
  if (matches.length === 0) {
    return null;
  }
  const [first] = matches;
  if (matches.length === 1 || !first) {
    return first ?? null;
  }
  const subject = input.action.subject?.trim() ?? "";
  if (!subject) {
    return null;
  }
  const bySubject = matches.filter((email) => (email.subject ?? "").trim() === subject);
  return bySubject.length === 1 && bySubject[0] ? bySubject[0] : null;
}
