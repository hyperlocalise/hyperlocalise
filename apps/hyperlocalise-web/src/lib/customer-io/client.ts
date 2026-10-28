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
import { resolveCustomerIoBaseUrl, type CustomerIoRegion } from "./constants";

export class CustomerIoApiError extends Error {
  code: string;
  status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "CustomerIoApiError";
    this.code = code;
    this.status = status;
  }
}

function customerIoErrorForStatus(status: number, path: string): CustomerIoApiError {
  if (status === 401) {
    return new CustomerIoApiError(
      "customer_io_unauthorized",
      `Customer.io rejected the API key for ${path}.`,
      status,
    );
  }
  if (status === 403) {
    return new CustomerIoApiError(
      "customer_io_forbidden",
      `The Customer.io API key is missing permission for ${path}.`,
      status,
    );
  }
  if (status === 404) {
    return new CustomerIoApiError(
      "customer_io_translation_missing",
      `Customer.io has no translation at ${path}.`,
      status,
    );
  }
  if (status === 429) {
    return new CustomerIoApiError(
      "customer_io_rate_limited",
      `Customer.io rate-limited the request to ${path}.`,
      status,
    );
  }
  return new CustomerIoApiError(
    "customer_io_request_failed",
    `Customer.io request to ${path} failed with status ${status}.`,
    status,
  );
}

export type CustomerIoBroadcastSummary = {
  id: string;
  name: string;
  updatedAt?: string | null;
};

export type CustomerIoCampaignSummary = {
  id: string;
  name: string;
  updatedAt?: string | null;
};

/**
 * Spike findings (Customer.io App API docs, Oct 2026):
 * - Newsletters ("one-time sends"): `GET /v1/newsletters` returns `{newsletters: [...]}`;
 *   list items carry `updated` (not `updated_at`). Message variants (translations or
 *   A/B tests) list via `GET /v1/newsletters/{id}/contents` (`{contents: [...]}`) with
 *   the same action fields (`id`, `name`, `type`, `language`, `subject`,
 *   `preheader_text`, `body`). Per-language read/write mirrors broadcasts:
 *   `GET|PUT /v1/newsletters/{id}/language/{language}`.
 * - Transactional: `GET /v1/transactional` lists message templates; variants list via
 *   `GET /v1/transactional/{id}/contents`; per-language read/write mirrors broadcasts:
 *   `GET|PUT /v1/transactional/{id}/language/{language}`. Push only ever updates
 *   message content — it never triggers a send (`POST /v1/send/...` is not used).
 */
export type CustomerIoNewsletterSummary = {
  id: string;
  name: string;
  updatedAt?: string | null;
};

export type CustomerIoTransactionalMessageSummary = {
  id: string;
  name: string;
  updatedAt?: string | null;
};

/** Message action inside a broadcast or campaign (automation). */
export type CustomerIoAction = {
  id: string;
  name: string;
  type: string;
  language: string;
  subject?: string;
  preheaderText?: string;
  title?: string;
  body?: string;
  updatedAt?: string | null;
};

export type CustomerIoActionTranslation = {
  language: string;
  subject?: string;
  preheaderText?: string;
  title?: string;
  body?: string;
  updatedAt?: string | null;
};

async function customerIoFetch(input: {
  apiKey: string;
  region: CustomerIoRegion;
  path: string;
  method?: string;
  body?: unknown;
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

type CustomerIoSummaryItem = {
  id?: unknown;
  name?: unknown;
  updated_at?: unknown;
  updated?: unknown;
};

function readCustomerIoSummaries(
  body: unknown,
  collectionKeys: readonly string[],
): Array<{ id: string; name: string; updatedAt: string | null }> {
  if (!body || typeof body !== "object") {
    return [];
  }
  const record = body as Record<string, unknown>;
  const items: unknown = collectionKeys
    .map((key) => record[key])
    .find((value) => Array.isArray(value));
  if (!Array.isArray(items)) {
    return [];
  }
  return (items as CustomerIoSummaryItem[]).flatMap((item) => {
    const id =
      typeof item.id === "number" ? String(item.id) : typeof item.id === "string" ? item.id : "";
    if (!id) {
      return [];
    }
    const rawName = typeof item.name === "string" ? item.name.trim() : "";
    // Fall back to the id so unnamed/draft resources (notably broadcasts)
    // still appear in the picker instead of rendering as an empty list.
    const name = rawName || id;
    const updatedAt =
      typeof item.updated_at === "number"
        ? new Date(item.updated_at * 1000).toISOString()
        : typeof item.updated === "number"
          ? new Date(item.updated * 1000).toISOString()
          : null;
    return [{ id, name, updatedAt }];
  });
}

async function listCustomerIoSummaries(input: {
  apiKey: string;
  region: CustomerIoRegion;
  path: string;
  collectionKeys: readonly string[];
  fetchImpl?: typeof fetch;
}): Promise<Array<{ id: string; name: string; updatedAt: string | null }>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await customerIoFetch({
    apiKey: input.apiKey,
    region: input.region,
    path: input.path,
    fetchImpl,
  });
  if (!response.ok) {
    throw customerIoErrorForStatus(response.status, input.path);
  }
  return readCustomerIoSummaries(await response.json().catch(() => null), input.collectionKeys);
}

export async function listCustomerIoBroadcasts(input: {
  apiKey: string;
  region: CustomerIoRegion;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoBroadcastSummary[]> {
  return listCustomerIoSummaries({
    ...input,
    path: "/broadcasts?limit=100",
    collectionKeys: ["broadcasts"],
  });
}

export async function listCustomerIoCampaigns(input: {
  apiKey: string;
  region: CustomerIoRegion;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoCampaignSummary[]> {
  return listCustomerIoSummaries({
    ...input,
    path: "/campaigns?limit=100",
    collectionKeys: ["campaigns"],
  });
}

export async function listCustomerIoNewsletters(input: {
  apiKey: string;
  region: CustomerIoRegion;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoNewsletterSummary[]> {
  return listCustomerIoSummaries({
    ...input,
    path: "/newsletters?limit=100",
    collectionKeys: ["newsletters"],
  });
}

export async function listCustomerIoTransactionalMessages(input: {
  apiKey: string;
  region: CustomerIoRegion;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoTransactionalMessageSummary[]> {
  return listCustomerIoSummaries({
    ...input,
    path: "/transactional?limit=100",
    collectionKeys: ["messages", "transactional"],
  });
}

type CustomerIoRawAction = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  language?: unknown;
  subject?: unknown;
  preheader_text?: unknown;
  title?: unknown;
  body?: unknown;
  updated?: unknown;
  deduplicate_id?: unknown;
};

function readCustomerIoAction(item: CustomerIoRawAction): CustomerIoAction | null {
  const id =
    typeof item.id === "number" ? String(item.id) : typeof item.id === "string" ? item.id : "";
  const type = typeof item.type === "string" ? item.type : "";
  if (!id || !type) {
    return null;
  }
  return {
    id,
    name: typeof item.name === "string" ? item.name : "",
    type,
    language: typeof item.language === "string" ? item.language : "",
    subject: typeof item.subject === "string" ? item.subject : undefined,
    preheaderText: typeof item.preheader_text === "string" ? item.preheader_text : undefined,
    title: typeof item.title === "string" ? item.title : undefined,
    body: typeof item.body === "string" ? item.body : undefined,
    updatedAt:
      typeof item.updated === "number" ? new Date(item.updated * 1000).toISOString() : null,
  };
}

async function listCustomerIoResourceActions(input: {
  apiKey: string;
  region: CustomerIoRegion;
  resourcePath: string;
  collectionKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoAction[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const collectionKey = input.collectionKey ?? "actions";
  const path =
    collectionKey === "actions"
      ? `${input.resourcePath}/actions`
      : `${input.resourcePath}/contents`;
  const response = await customerIoFetch({
    apiKey: input.apiKey,
    region: input.region,
    path,
    fetchImpl,
  });
  if (!response.ok) {
    throw customerIoErrorForStatus(response.status, path);
  }
  const body = (await response.json().catch(() => null)) as {
    actions?: CustomerIoRawAction[];
    contents?: CustomerIoRawAction[];
  } | null;
  const items = collectionKey === "actions" ? body?.actions : body?.contents;
  const actions = Array.isArray(items) ? items : [];
  return actions.flatMap((item) => {
    const action = readCustomerIoAction(item);
    return action ? [action] : [];
  });
}

export async function listCustomerIoBroadcastActions(input: {
  apiKey: string;
  region: CustomerIoRegion;
  broadcastId: string;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoAction[]> {
  return listCustomerIoResourceActions({
    ...input,
    resourcePath: `/broadcasts/${input.broadcastId}`,
  });
}

export async function listCustomerIoCampaignActions(input: {
  apiKey: string;
  region: CustomerIoRegion;
  campaignId: string;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoAction[]> {
  return listCustomerIoResourceActions({
    ...input,
    resourcePath: `/campaigns/${input.campaignId}`,
  });
}

export async function listCustomerIoNewsletterActions(input: {
  apiKey: string;
  region: CustomerIoRegion;
  newsletterId: string;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoAction[]> {
  return listCustomerIoResourceActions({
    ...input,
    resourcePath: `/newsletters/${input.newsletterId}`,
    collectionKey: "contents",
  });
}

export async function listCustomerIoTransactionalActions(input: {
  apiKey: string;
  region: CustomerIoRegion;
  transactionalMessageId: string;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoAction[]> {
  return listCustomerIoResourceActions({
    ...input,
    resourcePath: `/transactional/${input.transactionalMessageId}`,
    collectionKey: "contents",
  });
}

export async function getCustomerIoResourceAction(input: {
  apiKey: string;
  region: CustomerIoRegion;
  resourcePath: string;
  actionId: string;
  collectionKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoAction | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const collectionKey = input.collectionKey ?? "actions";
  const path =
    collectionKey === "actions"
      ? `${input.resourcePath}/actions/${input.actionId}`
      : `${input.resourcePath}/contents/${input.actionId}`;
  const response = await customerIoFetch({
    apiKey: input.apiKey,
    region: input.region,
    path,
    fetchImpl,
  });
  if (!response.ok) {
    throw customerIoErrorForStatus(response.status, path);
  }
  const body = (await response.json().catch(() => null)) as
    | (CustomerIoRawAction & { action?: unknown; content?: unknown })
    | null;
  if (!body || typeof body !== "object") {
    return null;
  }
  // Live detail endpoints wrap the payload (`{action: {...}}` for
  // broadcasts/campaigns, `{content: {...}}` for newsletters/transactional);
  // tests and list items use the flat shape.
  const unwrapped =
    body.action && typeof body.action === "object" && !Array.isArray(body.action)
      ? (body.action as CustomerIoRawAction)
      : body.content && typeof body.content === "object" && !Array.isArray(body.content)
        ? (body.content as CustomerIoRawAction)
        : body;
  return readCustomerIoAction(unwrapped);
}

function readCustomerIoActionTranslation(
  body: unknown,
  language: string,
): CustomerIoActionTranslation | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const item = body as CustomerIoRawAction;
  return {
    language,
    subject: typeof item.subject === "string" ? item.subject : undefined,
    preheaderText: typeof item.preheader_text === "string" ? item.preheader_text : undefined,
    title: typeof item.title === "string" ? item.title : undefined,
    body: typeof item.body === "string" ? item.body : undefined,
    updatedAt:
      typeof item.updated === "number" ? new Date(item.updated * 1000).toISOString() : null,
  };
}

async function getCustomerIoResourceActionTranslation(input: {
  apiKey: string;
  region: CustomerIoRegion;
  resourcePath: string;
  actionId: string;
  language: string;
  translationBasePath?: string;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoActionTranslation | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const encodedLanguage = encodeURIComponent(input.language);
  const basePath = input.translationBasePath ?? `${input.resourcePath}/actions/${input.actionId}`;
  const path = `${basePath}/language/${encodedLanguage}`;
  const response = await customerIoFetch({
    apiKey: input.apiKey,
    region: input.region,
    path,
    fetchImpl,
  });
  if (response.status === 404 || response.status === 400) {
    // 404 = language variant does not exist. 400 = Customer.io rejected the
    // language tag (e.g. zh-CN when that locale is not enabled/known).
    // Either way there is nothing to read — callers leave the locale for Jobs
    // (import) or skip it (push) instead of failing the whole action.
    return null;
  }
  if (!response.ok) {
    throw customerIoErrorForStatus(response.status, path);
  }
  return readCustomerIoActionTranslation(await response.json().catch(() => null), input.language);
}

export async function getCustomerIoBroadcastActionTranslation(input: {
  apiKey: string;
  region: CustomerIoRegion;
  broadcastId: string;
  actionId: string;
  language: string;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoActionTranslation | null> {
  return getCustomerIoResourceActionTranslation({
    ...input,
    resourcePath: `/broadcasts/${input.broadcastId}`,
  });
}

export async function getCustomerIoCampaignActionTranslation(input: {
  apiKey: string;
  region: CustomerIoRegion;
  campaignId: string;
  actionId: string;
  language: string;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoActionTranslation | null> {
  return getCustomerIoResourceActionTranslation({
    ...input,
    resourcePath: `/campaigns/${input.campaignId}`,
  });
}

export async function getCustomerIoNewsletterActionTranslation(input: {
  apiKey: string;
  region: CustomerIoRegion;
  newsletterId: string;
  actionId: string;
  language: string;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoActionTranslation | null> {
  return getCustomerIoResourceActionTranslation({
    ...input,
    resourcePath: `/newsletters/${input.newsletterId}`,
    // Newsletter variants are addressed by language directly; there is no
    // per-action segment on the translation endpoints.
    translationBasePath: `/newsletters/${input.newsletterId}`,
  });
}

export async function getCustomerIoTransactionalActionTranslation(input: {
  apiKey: string;
  region: CustomerIoRegion;
  transactionalMessageId: string;
  actionId: string;
  language: string;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoActionTranslation | null> {
  return getCustomerIoResourceActionTranslation({
    ...input,
    resourcePath: `/transactional/${input.transactionalMessageId}`,
    // Transactional translations are addressed by language directly; there is
    // no per-action segment on the translation endpoints.
    translationBasePath: `/transactional/${input.transactionalMessageId}`,
  });
}

export type CustomerIoActionTranslationPayload = {
  type: string;
  subject?: string;
  preheader_text?: string;
  title?: string;
  body?: string;
};

async function updateCustomerIoResourceActionTranslation(input: {
  apiKey: string;
  region: CustomerIoRegion;
  resourcePath: string;
  actionId: string;
  language: string;
  payload: CustomerIoActionTranslationPayload;
  translationBasePath?: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const encodedLanguage = encodeURIComponent(input.language);
  const basePath = input.translationBasePath ?? `${input.resourcePath}/actions/${input.actionId}`;
  const path = `${basePath}/language/${encodedLanguage}`;
  const response = await customerIoFetch({
    apiKey: input.apiKey,
    region: input.region,
    path,
    method: "PUT",
    body: input.payload,
    fetchImpl,
  });
  if (!response.ok) {
    throw customerIoErrorForStatus(response.status, path);
  }
}

export async function updateCustomerIoBroadcastActionTranslation(input: {
  apiKey: string;
  region: CustomerIoRegion;
  broadcastId: string;
  actionId: string;
  language: string;
  payload: CustomerIoActionTranslationPayload;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  return updateCustomerIoResourceActionTranslation({
    ...input,
    resourcePath: `/broadcasts/${input.broadcastId}`,
  });
}

export async function updateCustomerIoCampaignActionTranslation(input: {
  apiKey: string;
  region: CustomerIoRegion;
  campaignId: string;
  actionId: string;
  language: string;
  payload: CustomerIoActionTranslationPayload;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  return updateCustomerIoResourceActionTranslation({
    ...input,
    resourcePath: `/campaigns/${input.campaignId}`,
  });
}

export async function updateCustomerIoNewsletterActionTranslation(input: {
  apiKey: string;
  region: CustomerIoRegion;
  newsletterId: string;
  actionId: string;
  language: string;
  payload: CustomerIoActionTranslationPayload;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  return updateCustomerIoResourceActionTranslation({
    ...input,
    resourcePath: `/newsletters/${input.newsletterId}`,
    translationBasePath: `/newsletters/${input.newsletterId}`,
  });
}

export async function updateCustomerIoTransactionalActionTranslation(input: {
  apiKey: string;
  region: CustomerIoRegion;
  transactionalMessageId: string;
  actionId: string;
  language: string;
  payload: CustomerIoActionTranslationPayload;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  // Content-only update. Never sends: the send endpoints (`POST /v1/send/...`)
  // are not called anywhere in this integration.
  return updateCustomerIoResourceActionTranslation({
    ...input,
    resourcePath: `/transactional/${input.transactionalMessageId}`,
    translationBasePath: `/transactional/${input.transactionalMessageId}`,
  });
}
