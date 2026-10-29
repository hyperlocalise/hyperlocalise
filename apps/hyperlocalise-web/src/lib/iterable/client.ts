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

import {
  resolveIterableBaseUrl,
  type IterableMessageMedium,
  type IterableRegion,
} from "./constants";

export class IterableApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "IterableApiError";
    this.status = status;
    this.code = code;
  }
}

export type IterableTemplateListItem = {
  templateId: number;
  name: string;
  messageMedium?: string;
  updatedAt?: string;
};

export type IterableSnippetListItem = {
  id?: number;
  name: string;
  updatedAt?: string;
};

export type IterableEmailTemplate = {
  templateId: number;
  name: string;
  subject?: string;
  preheaderText?: string;
  html?: string;
  plainText?: string;
  editorType?: string;
  locale?: string;
  updatedAt?: string;
};

export type IterableInAppTemplate = {
  templateId: number;
  name: string;
  html?: string;
  title?: string;
  subtitle?: string;
  icon?: string;
  editorType?: string;
  locale?: string;
  inboxMetadata?: { title?: string; subtitle?: string; icon?: string; saveToInbox?: boolean };
  updatedAt?: string;
};

export type IterablePushTemplate = {
  templateId: number;
  name: string;
  title?: string;
  message?: string;
  locale?: string;
  updatedAt?: string;
};

export type IterableSmsTemplate = {
  templateId: number;
  name: string;
  message?: string;
  locale?: string;
  updatedAt?: string;
};

export type IterableSnippet = {
  id?: number;
  name: string;
  content?: string;
  variables?: string[];
  updatedAt?: string;
};

export type IterableClient = ReturnType<typeof createIterableClient>;

export function createIterableClient(input: { apiKey: string; region: IterableRegion }) {
  const baseUrl = resolveIterableBaseUrl(input.region);
  const apiKey = input.apiKey.trim();

  async function request<T>(
    path: string,
    init?: RequestInit & { parseJson?: boolean },
  ): Promise<T> {
    const extraHeaders: Record<string, string> =
      init?.headers instanceof Headers
        ? Object.fromEntries(init.headers.entries())
        : { ...(init?.headers as Record<string, string> | undefined) };
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Api-Key": apiKey,
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...extraHeaders,
      },
    });
    if (response.status >= 200 && response.status < 300) {
      if (init?.parseJson === false || response.status === 204) {
        return undefined as T;
      }
      return (await response.json()) as T;
    }
    const body = await response.text();
    if (response.status === 403) {
      throw new IterableApiError(response.status, "iterable_forbidden", body || "Forbidden");
    }
    if (response.status === 404) {
      throw new IterableApiError(response.status, "iterable_not_found", body || "Not found");
    }
    if (response.status === 400) {
      throw new IterableApiError(response.status, "iterable_bad_request", body || "Bad request");
    }
    throw new IterableApiError(
      response.status,
      "iterable_request_failed",
      body || `Iterable request failed (${response.status})`,
    );
  }

  async function listAllTemplates(messageMedium: IterableMessageMedium) {
    const items: IterableTemplateListItem[] = [];
    let page = 1;
    for (;;) {
      const body = await request<{
        templates?: IterableTemplateListItem[];
        nextPageUrl?: string | null;
      }>(
        `/api/templates?messageMedium=${encodeURIComponent(messageMedium)}&page=${page}&pageSize=1000`,
      );
      const batch = body.templates ?? [];
      items.push(...batch);
      if (!body.nextPageUrl || batch.length === 0) {
        break;
      }
      page += 1;
    }
    return items;
  }

  return {
    listAllTemplates,
    listSnippets: () =>
      request<{ snippets?: IterableSnippetListItem[] }>("/api/snippets").then(
        (body) => body.snippets ?? [],
      ),
    getEmailTemplate: (templateId: number, locale?: string) => {
      const query = new URLSearchParams({ templateId: String(templateId) });
      if (locale) {
        query.set("locale", locale);
      }
      return request<{ template?: IterableEmailTemplate }>(
        `/api/templates/email/get?${query.toString()}`,
      ).then((body) => body.template ?? null);
    },
    getInAppTemplate: (templateId: number, locale?: string) => {
      const query = new URLSearchParams({ templateId: String(templateId) });
      if (locale) {
        query.set("locale", locale);
      }
      return request<{ template?: IterableInAppTemplate }>(
        `/api/templates/inapp/get?${query.toString()}`,
      ).then((body) => body.template ?? null);
    },
    getPushTemplate: (templateId: number, locale?: string) => {
      const query = new URLSearchParams({ templateId: String(templateId) });
      if (locale) {
        query.set("locale", locale);
      }
      return request<{ template?: IterablePushTemplate }>(
        `/api/templates/push/get?${query.toString()}`,
      ).then((body) => body.template ?? null);
    },
    getSmsTemplate: (templateId: number, locale?: string) => {
      const query = new URLSearchParams({ templateId: String(templateId) });
      if (locale) {
        query.set("locale", locale);
      }
      return request<{ template?: IterableSmsTemplate }>(
        `/api/templates/sms/get?${query.toString()}`,
      ).then((body) => body.template ?? null);
    },
    getSnippet: (identifier: string) =>
      request<IterableSnippet>(`/api/snippets/${encodeURIComponent(identifier)}`),
    updateEmailTemplate: (body: Record<string, unknown>) =>
      request("/api/templates/email/update", { method: "POST", body: JSON.stringify(body) }),
    updateInAppTemplate: (body: Record<string, unknown>) =>
      request("/api/templates/inapp/update", { method: "POST", body: JSON.stringify(body) }),
    updatePushTemplate: (body: Record<string, unknown>) =>
      request("/api/templates/push/update", { method: "POST", body: JSON.stringify(body) }),
    updateSmsTemplate: (body: Record<string, unknown>) =>
      request("/api/templates/sms/update", { method: "POST", body: JSON.stringify(body) }),
    upsertEmailTemplate: (body: Record<string, unknown>) =>
      request("/api/templates/email/upsert", { method: "POST", body: JSON.stringify(body) }),
    upsertInAppTemplate: (body: Record<string, unknown>) =>
      request("/api/templates/inapp/upsert", { method: "POST", body: JSON.stringify(body) }),
    getByClientTemplateId: (clientTemplateId: string) =>
      request<{ template?: IterableEmailTemplate }>(
        `/api/templates/getByClientTemplateId?clientTemplateId=${encodeURIComponent(clientTemplateId)}`,
      ).then((body) => body.template ?? null),
    putSnippet: (name: string, body: Record<string, unknown>) =>
      request(`/api/snippets/${encodeURIComponent(name)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
  };
}
