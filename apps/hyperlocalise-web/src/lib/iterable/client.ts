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

/** JSON object whose sample value is `{}` (push payload, campaign id, action icon type). */
export type IterableJsonObject = {
  [key: string]: string | number | boolean | null;
};

export type IterableTemplateListItem = {
  templateId: number;
  createdAt: number;
  updatedAt: number;
  name: string;
  creatorUserId: string;
  messageTypeId: number;
};

export type IterableListedTemplate = IterableTemplateListItem & {
  messageMedium: IterableMessageMedium;
};

export type IterableTemplateListResponse = {
  templates: IterableTemplateListItem[];
  nextPageUrl?: string | null;
  previousPageUrl?: string | null;
};

export type IterableEmailTemplate = {
  templateId: number;
  name: string;
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  subject: string;
  preheaderText: string;
  ccEmails: string[];
  bccEmails: string[];
  html: string;
  plainText: string;
  cacheDataFeed: boolean;
  mergeDataFeedContext: boolean;
  messageTypeId: number;
  creatorUserId: string;
};

export type IterableEmailTemplateUpsert = {
  clientTemplateId: string | number;
  name: string;
  fromName?: string;
  fromEmail?: string;
  replyToEmail?: string;
  subject?: string;
  preheaderText?: string;
  html?: string;
  plainText?: string;
};

export type IterableEmailTemplateUpdate = {
  templateId: number;
  locale?: string;
  name?: string;
  fromName?: string;
  fromEmail?: string;
  replyToEmail?: string;
  subject?: string;
  preheaderText?: string;
  html?: string;
  plainText?: string;
};

export type IterableInAppDisplayEdge = {
  percentage: number;
};

export type IterableInAppDisplaySettings = {
  top: IterableInAppDisplayEdge;
  right: IterableInAppDisplayEdge;
  bottom: IterableInAppDisplayEdge;
  left: IterableInAppDisplayEdge;
};

export type IterableWebInAppDisplaySettings = {
  position: string;
};

export type IterableInAppTemplate = {
  templateId: number;
  name: string;
  html: string;
  inAppDisplaySettings: IterableInAppDisplaySettings;
  webInAppDisplaySettings: IterableWebInAppDisplaySettings;
  messageTypeId: number;
  isDefaultLocale: boolean;
};

export type IterableInAppTemplateUpsert = {
  clientTemplateId: string | number;
  name: string;
  html: string;
};

export type IterableInAppTemplateUpdate = {
  templateId: number;
  locale?: string;
  name?: string;
  html?: string;
  inAppDisplaySettings?: IterableInAppDisplaySettings;
  webInAppDisplaySettings?: IterableWebInAppDisplaySettings;
  messageTypeId?: number;
  isDefaultLocale?: boolean;
};

export type IterablePushButtonAction = {
  type: string;
  data: string;
};

export type IterablePushActionIcon = {
  iconType: IterableJsonObject;
  imageName: string;
};

export type IterablePushButton = {
  identifier: string;
  title: string;
  buttonType: string;
  action: IterablePushButtonAction;
  openApp: boolean;
  requiresUnlock: boolean;
  inputPlaceholder: string;
  inputTitle: string;
  actionIcon: IterablePushActionIcon;
};

export type IterablePlatformLinks = {
  ios: string;
  android: string;
};

export type IterablePushTemplate = {
  templateId: number;
  createdAt: string;
  updatedAt: string;
  name: string;
  title: string;
  message: string;
  payload: IterableJsonObject;
  badge: string;
  wake: boolean;
  relevanceScore: number;
  interruptionLevel: string;
  locale: string;
  messageTypeId: number;
  sound: string;
  buttons: IterablePushButton[];
  deeplink: IterablePlatformLinks;
  richMedia: IterablePlatformLinks;
  dataFeedIds: number[];
  cacheDataFeed: boolean;
  mergeDataFeedContext: boolean;
  clientTemplateId: string;
  campaignId: IterableJsonObject;
  isSilentPush: boolean;
};

export type IterablePushTemplateUpdate = {
  templateId: number;
  locale?: string;
  name?: string;
  title?: string;
  message?: string;
  payload?: IterableJsonObject;
  badge?: string;
  sound?: string;
  wake?: boolean;
  relevanceScore?: number;
  interruptionLevel?: string;
  messageTypeId?: number;
  buttons?: IterablePushButton[];
  deeplink?: IterablePlatformLinks;
  richMedia?: IterablePlatformLinks;
  dataFeedIds?: number[];
  cacheDataFeed?: boolean;
  mergeDataFeedContext?: boolean;
  clientTemplateId?: string;
  campaignId?: IterableJsonObject;
  isSilentPush?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type IterableSmsTemplate = {
  templateId: number;
  name: string;
  message: string;
  locale: string;
  messageTypeId: number;
};

export type IterableSmsTemplateUpsert = {
  clientTemplateId: string | number;
  name: string;
  message: string;
  locale?: string;
  messageTypeId?: string | number;
};

export type IterableSmsTemplateUpdate = {
  templateId: number;
  name?: string;
  message?: string;
  locale?: string;
  messageTypeId?: number;
};

export type IterableSnippet = {
  id: number;
  name: string;
  content: string;
  description: string;
  variables?: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  projectId: number;
};

export type IterableSnippetListResponse = {
  snippets: IterableSnippet[];
};

export type IterableSnippetGetResponse = {
  snippet: IterableSnippet;
};

export type IterableSnippetPutRequest = {
  content?: string;
  description?: string;
  variables?: string[];
};

export type IterableSnippetWriteResponse = {
  snippetId: number;
};

export type IterableTemplatesByClientTemplateIdResponse = {
  templates: IterableEmailTemplate[];
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
    const items: IterableListedTemplate[] = [];
    let page = 1;
    for (;;) {
      const body = await request<IterableTemplateListResponse>(
        `/api/templates?messageMedium=${encodeURIComponent(messageMedium)}&page=${page}&pageSize=1000`,
      );
      const batch = body.templates.map((item): IterableListedTemplate => ({
        ...item,
        messageMedium,
      }));
      items.push(...batch);
      if (!body.nextPageUrl || batch.length === 0) {
        break;
      }
      page += 1;
    }
    return items;
  }

  function templateQuery(templateId: number, locale?: string) {
    const query = new URLSearchParams({ templateId: String(templateId) });
    if (locale) {
      query.set("locale", locale);
    }
    return query.toString();
  }

  function postTemplate<TBody>(path: string, body: TBody) {
    return request<void>(path, {
      method: "POST",
      body: JSON.stringify(body),
      parseJson: false,
    });
  }

  return {
    listAllTemplates,
    listSnippets: () =>
      request<IterableSnippetListResponse>("/api/snippets").then((body) => body.snippets),
    getEmailTemplate: (templateId: number, locale?: string) =>
      request<IterableEmailTemplate>(
        `/api/templates/email/get?${templateQuery(templateId, locale)}`,
      ),
    getInAppTemplate: (templateId: number, locale?: string) =>
      request<IterableInAppTemplate>(
        `/api/templates/inapp/get?${templateQuery(templateId, locale)}`,
      ),
    getPushTemplate: (templateId: number, locale?: string) =>
      request<IterablePushTemplate>(`/api/templates/push/get?${templateQuery(templateId, locale)}`),
    getSmsTemplate: (templateId: number, locale?: string) =>
      request<IterableSmsTemplate>(`/api/templates/sms/get?${templateQuery(templateId, locale)}`),
    getSnippet: (identifier: string) =>
      request<IterableSnippetGetResponse>(`/api/snippets/${encodeURIComponent(identifier)}`).then(
        (body) => body.snippet,
      ),
    updateEmailTemplate: (body: IterableEmailTemplateUpdate) =>
      postTemplate("/api/templates/email/update", body),
    updateInAppTemplate: (body: IterableInAppTemplateUpdate) =>
      postTemplate("/api/templates/inapp/update", body),
    updatePushTemplate: (body: IterablePushTemplateUpdate) =>
      postTemplate("/api/templates/push/update", body),
    updateSmsTemplate: (body: IterableSmsTemplateUpdate) =>
      postTemplate("/api/templates/sms/update", body),
    upsertEmailTemplate: (body: IterableEmailTemplateUpsert) =>
      postTemplate("/api/templates/email/upsert", body),
    upsertInAppTemplate: (body: IterableInAppTemplateUpsert) =>
      postTemplate("/api/templates/inapp/upsert", body),
    getByClientTemplateId: (clientTemplateId: string) =>
      request<IterableTemplatesByClientTemplateIdResponse>(
        `/api/templates/getByClientTemplateId?clientTemplateId=${encodeURIComponent(clientTemplateId)}`,
      ).then((body) => body.templates[0] ?? null),
    putSnippet: (name: string, body: IterableSnippetPutRequest) =>
      request<IterableSnippetWriteResponse>(`/api/snippets/${encodeURIComponent(name)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
  };
}
