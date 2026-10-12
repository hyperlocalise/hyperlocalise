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
  BRAZE_CONTENT_BLOCK_MAX_BYTES,
  BRAZE_EMAIL_BODY_MAX_BYTES,
  BRAZE_TEMPLATES_LIST_LIMIT,
  BRAZE_TEMPLATES_LIST_MAX_LIMIT,
  resolveBrazeRestBaseUrl,
  type BrazeRestEndpoint,
} from "./constants";

export class BrazeApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(input: { message: string; status: number; code?: string }) {
    super(input.message);
    this.name = "BrazeApiError";
    this.status = input.status;
    this.code = input.code ?? "braze_api_error";
  }
}

export function isBrazeDragAndDropTemplateError(error: unknown): boolean {
  if (!(error instanceof BrazeApiError)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    error.code === "braze_drag_and_drop_template" ||
    message.includes("drag-and-drop") ||
    message.includes("drag and drop")
  );
}

export type BrazeEmailTemplateListItem = {
  email_template_id: string;
  template_name: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
};

export type BrazeEmailTemplateInfo = {
  email_template_id: string;
  template_name: string;
  description?: string;
  subject: string;
  preheader?: string;
  body?: string;
  plaintext_body?: string;
  should_inline_css?: boolean;
  tags?: string[] | string;
  created_at?: string;
  updated_at?: string;
};

export type BrazeContentBlockListItem = {
  content_block_id: string;
  name: string;
  content_type?: string;
  liquid_tag?: string;
  inclusion_count?: number;
  created_at?: string;
  last_edited?: string;
  tags?: string[];
};

export type BrazeContentBlockInfo = {
  content_block_id: string;
  name: string;
  content: string;
  description?: string;
  content_type?: string;
  tags?: string[];
  created_at?: string;
  last_edited?: string;
  inclusion_count?: number;
};

export type BrazeListQuery = {
  modifiedAfter?: string | null;
  modifiedBefore?: string | null;
  limit?: number;
  offset?: number;
};

export type BrazeCreateEmailTemplateInput = {
  template_name: string;
  subject: string;
  body: string;
  plaintext_body?: string;
  preheader?: string;
  tags?: string[];
  should_inline_css?: boolean;
};

export type BrazeUpdateEmailTemplateInput = {
  email_template_id: string;
  template_name?: string;
  subject?: string;
  body?: string;
  plaintext_body?: string;
  preheader?: string;
  tags?: string[];
  should_inline_css?: boolean;
};

export type BrazeCreateContentBlockInput = {
  name: string;
  content: string;
  description?: string;
  state?: "active" | "draft";
  tags?: string[];
};

export type BrazeUpdateContentBlockInput = {
  content_block_id: string;
  name?: string;
  content?: string;
  description?: string;
  state?: "active" | "draft";
  tags?: string[];
};

export type BrazeCampaignListItem = {
  id: string;
  name: string;
  last_edited?: string;
  is_draft?: boolean;
  draft?: boolean;
  is_archived?: boolean;
  archived?: boolean;
};

export type BrazeCanvasListItem = {
  id: string;
  name: string;
  last_edited?: string;
  is_draft?: boolean;
  draft?: boolean;
  is_archived?: boolean;
  archived?: boolean;
};

export type BrazeMessageVariationRef = {
  messageVariationId: string;
  name?: string;
  channel?: string;
};

export type BrazeCanvasStepRef = {
  stepId: string;
  name?: string;
  variations: BrazeMessageVariationRef[];
};

export type BrazeLocaleTranslation = {
  translation_map: Record<string, string>;
  locale: {
    uuid: string;
    name?: string;
    locale_key?: string;
    language?: string;
    country?: string;
  };
};

export type BrazeTemplatesClient = {
  listEmailTemplates: (query?: BrazeListQuery) => Promise<{
    count: number;
    templates: BrazeEmailTemplateListItem[];
  }>;
  getEmailTemplate: (emailTemplateId: string) => Promise<BrazeEmailTemplateInfo>;
  createEmailTemplate: (
    input: BrazeCreateEmailTemplateInput,
  ) => Promise<{ email_template_id: string }>;
  updateEmailTemplate: (input: BrazeUpdateEmailTemplateInput) => Promise<void>;
  listContentBlocks: (query?: BrazeListQuery) => Promise<{
    count: number;
    content_blocks: BrazeContentBlockListItem[];
  }>;
  getContentBlock: (contentBlockId: string) => Promise<BrazeContentBlockInfo>;
  createContentBlock: (
    input: BrazeCreateContentBlockInput,
  ) => Promise<{ content_block_id: string; liquid_tag?: string }>;
  updateContentBlock: (input: BrazeUpdateContentBlockInput) => Promise<void>;
  listCampaigns: (query?: { page?: number }) => Promise<{
    campaigns: BrazeCampaignListItem[];
  }>;
  getCampaignDetails: (campaignId: string) => Promise<{
    id: string;
    name: string;
    isDraft: boolean;
    isArchived: boolean;
    lastEdited?: string;
    variations: BrazeMessageVariationRef[];
  }>;
  getCampaignSourceTranslations: (input: {
    campaignId: string;
    messageVariationId: string;
    postLaunchDraftVersion?: boolean;
  }) => Promise<BrazeLocaleTranslation[]>;
  getCampaignTranslations: (input: {
    campaignId: string;
    messageVariationId: string;
    localeId?: string;
    postLaunchDraftVersion?: boolean;
  }) => Promise<BrazeLocaleTranslation[]>;
  updateCampaignTranslation: (input: {
    campaignId: string;
    messageVariationId: string;
    localeId: string;
    translationMap: Record<string, string>;
  }) => Promise<void>;
  listCanvases: (query?: { page?: number }) => Promise<{
    canvases: BrazeCanvasListItem[];
  }>;
  getCanvasDetails: (workflowId: string) => Promise<{
    id: string;
    name: string;
    isDraft: boolean;
    isArchived: boolean;
    lastEdited?: string;
    steps: BrazeCanvasStepRef[];
  }>;
  getCanvasSourceTranslations: (input: {
    workflowId: string;
    stepId: string;
    messageVariationId: string;
    postLaunchDraftVersion?: boolean;
  }) => Promise<BrazeLocaleTranslation[]>;
  getCanvasTranslations: (input: {
    workflowId: string;
    stepId: string;
    messageVariationId: string;
    localeId?: string;
    postLaunchDraftVersion?: boolean;
  }) => Promise<BrazeLocaleTranslation[]>;
  updateCanvasTranslation: (input: {
    workflowId: string;
    stepId: string;
    messageVariationId: string;
    localeId: string;
    translationMap: Record<string, string>;
  }) => Promise<void>;
};

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function listLimit(limit?: number): number {
  if (limit == null) {
    return BRAZE_TEMPLATES_LIST_LIMIT;
  }
  return Math.min(Math.max(1, Math.floor(limit)), BRAZE_TEMPLATES_LIST_MAX_LIMIT);
}

function appendListQuery(url: URL, query?: BrazeListQuery) {
  if (query?.modifiedAfter) {
    url.searchParams.set("modified_after", query.modifiedAfter);
  }
  if (query?.modifiedBefore) {
    url.searchParams.set("modified_before", query.modifiedBefore);
  }
  url.searchParams.set("limit", String(listLimit(query?.limit)));
  if (query?.offset != null && query.offset > 0) {
    url.searchParams.set("offset", String(Math.floor(query.offset)));
  } else if (query?.offset === 0) {
    url.searchParams.set("offset", "0");
  }
}

function readErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }
  return fallback;
}

function classifyBrazeError(
  status: number,
  message: string,
  path?: string,
  method = "GET",
): string {
  const lower = message.toLowerCase();
  if (lower.includes("drag-and-drop") || lower.includes("drag and drop")) {
    return "braze_drag_and_drop_template";
  }
  if (lower.includes("already exists")) {
    return "braze_name_exists";
  }
  if (lower.includes("does not have multi-language") || lower.includes("multi-language setup")) {
    return "braze_no_multi_language";
  }
  if (status === 401 || status === 403) {
    if (path?.includes("/campaigns/details")) {
      return "braze_permission_missing_campaigns.details";
    }
    if (path?.includes("/campaigns/translations")) {
      return method === "PUT"
        ? "braze_permission_missing_campaigns.translations.update"
        : "braze_permission_missing_campaigns.translations.get";
    }
    if (path?.includes("/canvas/details")) {
      return "braze_permission_missing_canvas.details";
    }
    if (path?.includes("/canvas/translations")) {
      return method === "PUT"
        ? "braze_permission_missing_canvas.translations.update"
        : "braze_permission_missing_canvas.translations.get";
    }
    return "braze_unauthorized";
  }
  return "braze_api_error";
}

export function brazePermissionNameFromError(error: unknown): string | null {
  if (!(error instanceof BrazeApiError)) {
    return null;
  }
  if (error.code.startsWith("braze_permission_missing_")) {
    return error.code.replace("braze_permission_missing_", "");
  }
  return null;
}

function readBooleanFlag(...values: unknown[]): boolean {
  return values.some((value) => value === true);
}

function readMessageVariations(messages: unknown): BrazeMessageVariationRef[] {
  if (!messages || typeof messages !== "object" || Array.isArray(messages)) {
    return [];
  }
  return Object.entries(messages as Record<string, unknown>).flatMap(([id, value]) => {
    if (!id.trim()) {
      return [];
    }
    const record = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const named = record as { name?: unknown; channel?: unknown; message_variation_id?: unknown };
    return [
      {
        messageVariationId:
          typeof named.message_variation_id === "string" && named.message_variation_id.trim()
            ? named.message_variation_id
            : id,
        name: typeof named.name === "string" ? named.name : undefined,
        channel: typeof named.channel === "string" ? named.channel : undefined,
      },
    ];
  });
}

function readCanvasSteps(steps: unknown): BrazeCanvasStepRef[] {
  if (!Array.isArray(steps)) {
    return [];
  }
  return steps.flatMap((step) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      return [];
    }
    const record = step as { id?: unknown; name?: unknown; messages?: unknown };
    const stepId = typeof record.id === "string" ? record.id.trim() : "";
    if (!stepId) {
      return [];
    }
    return [
      {
        stepId,
        name: typeof record.name === "string" ? record.name : undefined,
        variations: readMessageVariations(record.messages),
      },
    ];
  });
}

function readTranslationEntries(body: unknown): BrazeLocaleTranslation[] {
  const records =
    body && typeof body === "object" && "translations" in body && Array.isArray(body.translations)
      ? body.translations
      : body && typeof body === "object" && "translation_map" in body
        ? [body]
        : [];
  return records.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const record = entry as {
      translation_map?: unknown;
      locale?: {
        uuid?: unknown;
        name?: unknown;
        locale_key?: unknown;
        language?: unknown;
        country?: unknown;
      };
    };
    const translationMap =
      record.translation_map &&
      typeof record.translation_map === "object" &&
      !Array.isArray(record.translation_map)
        ? Object.fromEntries(
            Object.entries(record.translation_map).flatMap(([key, value]) =>
              typeof value === "string" ? [[key, value]] : [],
            ),
          )
        : {};
    const uuid = typeof record.locale?.uuid === "string" ? record.locale.uuid.trim() : "";
    return [
      {
        translation_map: translationMap,
        locale: {
          uuid,
          name: typeof record.locale?.name === "string" ? record.locale.name : undefined,
          locale_key:
            typeof record.locale?.locale_key === "string" ? record.locale.locale_key : undefined,
          language:
            typeof record.locale?.language === "string" ? record.locale.language : undefined,
          country: typeof record.locale?.country === "string" ? record.locale.country : undefined,
        },
      },
    ];
  });
}

export function createBrazeTemplatesClient(input: {
  apiKey: string;
  restEndpoint: BrazeRestEndpoint;
  fetchImpl?: typeof fetch;
}): BrazeTemplatesClient {
  const baseUrl = resolveBrazeRestBaseUrl(input.restEndpoint);
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = {
    Authorization: `Bearer ${input.apiKey.trim()}`,
    Accept: "application/json",
  };

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { message: text };
      }
    }
    if (!response.ok) {
      const message = readErrorMessage(body, `Braze request failed (${response.status}).`);
      throw new BrazeApiError({
        message,
        status: response.status,
        code: classifyBrazeError(
          response.status,
          message,
          path,
          typeof init?.method === "string" ? init.method : "GET",
        ),
      });
    }
    return (body ?? {}) as T;
  }

  return {
    async listEmailTemplates(query) {
      const url = new URL("/templates/email/list", baseUrl);
      appendListQuery(url, query);
      const body = await request<{ count?: number; templates?: BrazeEmailTemplateListItem[] }>(
        `${url.pathname}${url.search}`,
      );
      return {
        count: typeof body.count === "number" ? body.count : (body.templates?.length ?? 0),
        templates: body.templates ?? [],
      };
    },
    async getEmailTemplate(emailTemplateId) {
      const url = new URL("/templates/email/info", baseUrl);
      url.searchParams.set("email_template_id", emailTemplateId);
      return request<BrazeEmailTemplateInfo>(`${url.pathname}${url.search}`);
    },
    async createEmailTemplate(createInput) {
      if (utf8ByteLength(createInput.body) > BRAZE_EMAIL_BODY_MAX_BYTES) {
        throw new BrazeApiError({
          message: "Email template body exceeds Braze's 400 KB limit.",
          status: 400,
          code: "braze_email_body_too_large",
        });
      }
      const body = await request<{ email_template_id: string }>("/templates/email/create", {
        method: "POST",
        body: JSON.stringify(createInput),
      });
      return { email_template_id: body.email_template_id };
    },
    async updateEmailTemplate(updateInput) {
      const { email_template_id: _emailTemplateId, ...fields } = updateInput;
      if (Object.keys(fields).length === 0) {
        throw new BrazeApiError({
          message: "Email template update requires at least one field besides email_template_id.",
          status: 400,
          code: "braze_update_fields_required",
        });
      }
      if (fields.body != null && utf8ByteLength(fields.body) > BRAZE_EMAIL_BODY_MAX_BYTES) {
        throw new BrazeApiError({
          message: "Email template body exceeds Braze's 400 KB limit.",
          status: 400,
          code: "braze_email_body_too_large",
        });
      }
      await request("/templates/email/update", {
        method: "POST",
        body: JSON.stringify(updateInput),
      });
    },
    async listContentBlocks(query) {
      const url = new URL("/content_blocks/list", baseUrl);
      appendListQuery(url, query);
      const body = await request<{
        count?: number;
        content_blocks?: BrazeContentBlockListItem[];
      }>(`${url.pathname}${url.search}`);
      return {
        count: typeof body.count === "number" ? body.count : (body.content_blocks?.length ?? 0),
        content_blocks: body.content_blocks ?? [],
      };
    },
    async getContentBlock(contentBlockId) {
      const url = new URL("/content_blocks/info", baseUrl);
      url.searchParams.set("content_block_id", contentBlockId);
      return request<BrazeContentBlockInfo>(`${url.pathname}${url.search}`);
    },
    async createContentBlock(createInput) {
      if (utf8ByteLength(createInput.content) > BRAZE_CONTENT_BLOCK_MAX_BYTES) {
        throw new BrazeApiError({
          message: "Content Block content exceeds Braze's 50 KB limit.",
          status: 400,
          code: "braze_content_block_too_large",
        });
      }
      const body = await request<{ content_block_id: string; liquid_tag?: string }>(
        "/content_blocks/create",
        {
          method: "POST",
          body: JSON.stringify(createInput),
        },
      );
      return { content_block_id: body.content_block_id, liquid_tag: body.liquid_tag };
    },
    async updateContentBlock(updateInput) {
      if (
        updateInput.content != null &&
        utf8ByteLength(updateInput.content) > BRAZE_CONTENT_BLOCK_MAX_BYTES
      ) {
        throw new BrazeApiError({
          message: "Content Block content exceeds Braze's 50 KB limit.",
          status: 400,
          code: "braze_content_block_too_large",
        });
      }
      await request("/content_blocks/update", {
        method: "POST",
        body: JSON.stringify(updateInput),
      });
    },
    async listCampaigns(query) {
      const url = new URL("/campaigns/list", baseUrl);
      url.searchParams.set("page", String(Math.max(0, query?.page ?? 0)));
      const body = await request<{ campaigns?: BrazeCampaignListItem[] }>(
        `${url.pathname}${url.search}`,
      );
      return { campaigns: body.campaigns ?? [] };
    },
    async getCampaignDetails(campaignId) {
      const url = new URL("/campaigns/details", baseUrl);
      url.searchParams.set("campaign_id", campaignId);
      const body = await request<{
        id?: string;
        name?: string;
        draft?: boolean;
        is_draft?: boolean;
        archived?: boolean;
        is_archived?: boolean;
        updated_at?: string;
        last_edited?: string;
        messages?: unknown;
      }>(`${url.pathname}${url.search}`);
      return {
        id: typeof body.id === "string" && body.id.trim() ? body.id : campaignId,
        name: typeof body.name === "string" ? body.name : campaignId,
        isDraft: readBooleanFlag(body.draft, body.is_draft),
        isArchived: readBooleanFlag(body.archived, body.is_archived),
        lastEdited:
          typeof body.last_edited === "string"
            ? body.last_edited
            : typeof body.updated_at === "string"
              ? body.updated_at
              : undefined,
        variations: readMessageVariations(body.messages),
      };
    },
    async getCampaignSourceTranslations(input) {
      const url = new URL("/campaigns/translations/source", baseUrl);
      url.searchParams.set("campaign_id", input.campaignId);
      url.searchParams.set("message_variation_id", input.messageVariationId);
      if (input.postLaunchDraftVersion) {
        url.searchParams.set("post_launch_draft_version", "true");
      }
      return readTranslationEntries(await request(`${url.pathname}${url.search}`));
    },
    async getCampaignTranslations(input) {
      const url = new URL("/campaigns/translations", baseUrl);
      url.searchParams.set("campaign_id", input.campaignId);
      url.searchParams.set("message_variation_id", input.messageVariationId);
      if (input.localeId) {
        url.searchParams.set("locale_id", input.localeId);
      }
      if (input.postLaunchDraftVersion) {
        url.searchParams.set("post_launch_draft_version", "true");
      }
      return readTranslationEntries(await request(`${url.pathname}${url.search}`));
    },
    async updateCampaignTranslation(input) {
      await request("/campaigns/translations", {
        method: "PUT",
        body: JSON.stringify({
          campaign_id: input.campaignId,
          message_variation_id: input.messageVariationId,
          locale_id: input.localeId,
          translation_map: input.translationMap,
        }),
      });
    },
    async listCanvases(query) {
      const url = new URL("/canvas/list", baseUrl);
      url.searchParams.set("page", String(Math.max(0, query?.page ?? 0)));
      const body = await request<{ canvases?: BrazeCanvasListItem[] }>(
        `${url.pathname}${url.search}`,
      );
      return { canvases: body.canvases ?? [] };
    },
    async getCanvasDetails(workflowId) {
      const url = new URL("/canvas/details", baseUrl);
      url.searchParams.set("canvas_id", workflowId);
      const body = await request<{
        id?: string;
        name?: string;
        draft?: boolean;
        is_draft?: boolean;
        archived?: boolean;
        is_archived?: boolean;
        updated_at?: string;
        last_edited?: string;
        steps?: unknown;
      }>(`${url.pathname}${url.search}`);
      return {
        id: typeof body.id === "string" && body.id.trim() ? body.id : workflowId,
        name: typeof body.name === "string" ? body.name : workflowId,
        isDraft: readBooleanFlag(body.draft, body.is_draft),
        isArchived: readBooleanFlag(body.archived, body.is_archived),
        lastEdited:
          typeof body.last_edited === "string"
            ? body.last_edited
            : typeof body.updated_at === "string"
              ? body.updated_at
              : undefined,
        steps: readCanvasSteps(body.steps),
      };
    },
    async getCanvasSourceTranslations(input) {
      const url = new URL("/canvas/translations/source", baseUrl);
      url.searchParams.set("workflow_id", input.workflowId);
      url.searchParams.set("step_id", input.stepId);
      url.searchParams.set("message_variation_id", input.messageVariationId);
      if (input.postLaunchDraftVersion) {
        url.searchParams.set("post_launch_draft_version", "true");
      }
      return readTranslationEntries(await request(`${url.pathname}${url.search}`));
    },
    async getCanvasTranslations(input) {
      const url = new URL("/canvas/translations", baseUrl);
      url.searchParams.set("workflow_id", input.workflowId);
      url.searchParams.set("step_id", input.stepId);
      url.searchParams.set("message_variation_id", input.messageVariationId);
      if (input.localeId) {
        url.searchParams.set("locale_id", input.localeId);
      }
      if (input.postLaunchDraftVersion) {
        url.searchParams.set("post_launch_draft_version", "true");
      }
      return readTranslationEntries(await request(`${url.pathname}${url.search}`));
    },
    async updateCanvasTranslation(input) {
      await request("/canvas/translations", {
        method: "PUT",
        body: JSON.stringify({
          workflow_id: input.workflowId,
          step_id: input.stepId,
          message_variation_id: input.messageVariationId,
          locale_id: input.localeId,
          translation_map: input.translationMap,
        }),
      });
    },
  };
}

export async function listAllBrazeCampaigns(
  client: BrazeTemplatesClient,
): Promise<BrazeCampaignListItem[]> {
  const campaigns: BrazeCampaignListItem[] = [];
  let page = 0;
  while (true) {
    const result = await client.listCampaigns({ page });
    campaigns.push(...result.campaigns);
    if (result.campaigns.length === 0) {
      break;
    }
    page += 1;
    if (page > 100) {
      break;
    }
  }
  return campaigns;
}

export async function listAllBrazeCanvases(
  client: BrazeTemplatesClient,
): Promise<BrazeCanvasListItem[]> {
  const canvases: BrazeCanvasListItem[] = [];
  let page = 0;
  while (true) {
    const result = await client.listCanvases({ page });
    canvases.push(...result.canvases);
    if (result.canvases.length === 0) {
      break;
    }
    page += 1;
    if (page > 100) {
      break;
    }
  }
  return canvases;
}

export async function listAllBrazeEmailTemplates(
  client: BrazeTemplatesClient,
  query?: Omit<BrazeListQuery, "offset">,
): Promise<BrazeEmailTemplateListItem[]> {
  const templates: BrazeEmailTemplateListItem[] = [];
  const limit = listLimit(query?.limit);
  let offset = 0;
  while (true) {
    const page = await client.listEmailTemplates({ ...query, limit, offset });
    templates.push(...page.templates);
    if (page.templates.length < limit) {
      break;
    }
    offset += page.templates.length;
  }
  return templates;
}

export async function listAllBrazeContentBlocks(
  client: BrazeTemplatesClient,
  query?: Omit<BrazeListQuery, "offset">,
): Promise<BrazeContentBlockListItem[]> {
  const blocks: BrazeContentBlockListItem[] = [];
  const limit = listLimit(query?.limit);
  let offset = 0;
  while (true) {
    const page = await client.listContentBlocks({ ...query, limit, offset });
    blocks.push(...page.content_blocks);
    if (page.content_blocks.length < limit) {
      break;
    }
    offset += page.content_blocks.length;
  }
  return blocks;
}
