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

function classifyBrazeError(status: number, message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("drag-and-drop") || lower.includes("drag and drop")) {
    return "braze_drag_and_drop_template";
  }
  if (lower.includes("already exists")) {
    return "braze_name_exists";
  }
  if (status === 401 || status === 403) {
    return "braze_unauthorized";
  }
  return "braze_api_error";
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
        code: classifyBrazeError(response.status, message),
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
  };
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
