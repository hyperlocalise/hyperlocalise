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

export async function listCustomerIoBroadcasts(input: {
  apiKey: string;
  region: CustomerIoRegion;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoBroadcastSummary[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await customerIoFetch({
    apiKey: input.apiKey,
    region: input.region,
    path: "/broadcasts?limit=100",
    fetchImpl,
  });
  if (!response.ok) {
    throw new Error(`customer_io_broadcasts_list_failed:${response.status}`);
  }
  const body = (await response.json().catch(() => null)) as {
    broadcasts?: Array<{ id?: unknown; name?: unknown; updated_at?: unknown }>;
  } | null;
  const broadcasts = Array.isArray(body?.broadcasts) ? body.broadcasts : [];
  return broadcasts.flatMap((item) => {
    const id =
      typeof item.id === "number" ? String(item.id) : typeof item.id === "string" ? item.id : "";
    const name = typeof item.name === "string" ? item.name : "";
    if (!id || !name) {
      return [];
    }
    return [
      {
        id,
        name,
        updatedAt:
          typeof item.updated_at === "number"
            ? new Date(item.updated_at * 1000).toISOString()
            : null,
      },
    ];
  });
}

export async function listCustomerIoCampaigns(input: {
  apiKey: string;
  region: CustomerIoRegion;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoCampaignSummary[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await customerIoFetch({
    apiKey: input.apiKey,
    region: input.region,
    path: "/campaigns?limit=100",
    fetchImpl,
  });
  if (!response.ok) {
    throw customerIoErrorForStatus(response.status, "/campaigns");
  }
  const body = (await response.json().catch(() => null)) as {
    campaigns?: Array<{ id?: unknown; name?: unknown; updated_at?: unknown }>;
  } | null;
  const campaigns = Array.isArray(body?.campaigns) ? body.campaigns : [];
  return campaigns.flatMap((item) => {
    const id =
      typeof item.id === "number" ? String(item.id) : typeof item.id === "string" ? item.id : "";
    const name = typeof item.name === "string" ? item.name : "";
    if (!id || !name) {
      return [];
    }
    return [
      {
        id,
        name,
        updatedAt:
          typeof item.updated_at === "number"
            ? new Date(item.updated_at * 1000).toISOString()
            : null,
      },
    ];
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
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoAction[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const path = `${input.resourcePath}/actions`;
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
  } | null;
  const actions = Array.isArray(body?.actions) ? body.actions : [];
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

export async function getCustomerIoResourceAction(input: {
  apiKey: string;
  region: CustomerIoRegion;
  resourcePath: string;
  actionId: string;
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoAction | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const path = `${input.resourcePath}/actions/${input.actionId}`;
  const response = await customerIoFetch({
    apiKey: input.apiKey,
    region: input.region,
    path,
    fetchImpl,
  });
  if (!response.ok) {
    throw customerIoErrorForStatus(response.status, path);
  }
  const body = (await response.json().catch(() => null)) as CustomerIoRawAction | null;
  if (!body || typeof body !== "object") {
    return null;
  }
  return readCustomerIoAction(body);
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
  fetchImpl?: typeof fetch;
}): Promise<CustomerIoActionTranslation | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const encodedLanguage = encodeURIComponent(input.language);
  const path = `${input.resourcePath}/actions/${input.actionId}/language/${encodedLanguage}`;
  const response = await customerIoFetch({
    apiKey: input.apiKey,
    region: input.region,
    path,
    fetchImpl,
  });
  if (response.status === 404) {
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
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const encodedLanguage = encodeURIComponent(input.language);
  const path = `${input.resourcePath}/actions/${input.actionId}/language/${encodedLanguage}`;
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
