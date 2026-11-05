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

import { MAILCHIMP_LIST_PAGE_SIZE } from "./constants";

type MailchimpListResponse<T> = {
  campaigns?: T[];
  templates?: T[];
  lists?: T[];
  total_items?: number;
};

export type MailchimpAudienceCampaignDefaults = {
  from_email?: string;
  from_name?: string;
};

export type MailchimpAudienceSummary = {
  id: string;
  name?: string;
  campaign_defaults?: MailchimpAudienceCampaignDefaults;
};

export type MailchimpAudienceDetail = MailchimpAudienceSummary;

export type MailchimpCampaignSummary = {
  id: string;
  type: string;
  create_time?: string;
  settings: {
    title?: string;
    subject_line?: string;
    preview_text?: string;
    from_name?: string;
    from_email?: string;
    reply_to?: string;
    template_id?: number;
  };
  recipients?: { list_id?: string };
};

export type MailchimpCampaignContent = {
  html?: string;
  archive_html?: string;
  variate_contents?: Array<{ html?: string }>;
};

export type MailchimpTemplateDefaultContent = {
  sections?: unknown;
  html?: string;
  archive_html?: string;
};

export type MailchimpTemplateSummary = {
  id: number;
  name: string;
  type: string;
  content_type?: "html" | "template" | "multichannel";
  drag_and_drop?: boolean;
  active?: boolean;
};

export type MailchimpTemplateDetail = {
  id: number;
  name: string;
  type?: string;
  html?: string;
  sections?: unknown;
  content_type?: "html" | "template" | "multichannel";
  drag_and_drop?: boolean;
  active?: boolean;
  date_edited?: string;
  date_created?: string;
  /** Legacy alias some responses use. */
  edited_on?: string;
  created_on?: string;
};

export type MailchimpClient = ReturnType<typeof createMailchimpClient>;

const DEFAULT_MAILCHIMP_FROM_NAME = "Newsletter";

/** Marketing API 3.0 client using a Mailchimp OAuth access token and account API endpoint. */
export function createMailchimpClient(input: {
  accessToken: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}) {
  const baseUrl = input.baseUrl.trim().replace(/\/$/, "");
  const accessToken = input.accessToken.trim();
  if (!baseUrl || !accessToken) {
    throw new Error("invalid_mailchimp_oauth_credentials");
  }
  const authorization = `Bearer ${accessToken}`;
  const fetchImpl = input.fetchImpl ?? fetch;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", authorization);
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const error = new Error(formatMailchimpApiErrorBody(body, response.status));
      (error as MailchimpHttpError).statusCode = response.status;
      throw error;
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  return {
    async getAudience(audienceId: string): Promise<MailchimpAudienceDetail> {
      return request<MailchimpAudienceDetail>(`/lists/${encodeURIComponent(audienceId)}`);
    },

    async listAudiences(): Promise<MailchimpAudienceSummary[]> {
      const out: MailchimpAudienceSummary[] = [];
      let offset = 0;
      for (;;) {
        const page = await request<MailchimpListResponse<MailchimpAudienceSummary>>(
          `/lists?count=${MAILCHIMP_LIST_PAGE_SIZE}&offset=${offset}`,
        );
        const batch = page.lists ?? [];
        out.push(...batch);
        if (batch.length < MAILCHIMP_LIST_PAGE_SIZE) {
          break;
        }
        offset += batch.length;
      }
      return out;
    },

    async listRegularCampaigns(): Promise<MailchimpCampaignSummary[]> {
      const out: MailchimpCampaignSummary[] = [];
      let offset = 0;
      for (;;) {
        const page = await request<MailchimpListResponse<MailchimpCampaignSummary>>(
          `/campaigns?type=regular&count=${MAILCHIMP_LIST_PAGE_SIZE}&offset=${offset}`,
        );
        const batch = page.campaigns ?? [];
        out.push(...batch);
        if (batch.length < MAILCHIMP_LIST_PAGE_SIZE) {
          break;
        }
        offset += batch.length;
      }
      return out;
    },

    async getCampaign(campaignId: string): Promise<MailchimpCampaignSummary> {
      return request<MailchimpCampaignSummary>(`/campaigns/${encodeURIComponent(campaignId)}`);
    },

    async getCampaignContent(campaignId: string): Promise<MailchimpCampaignContent> {
      return request<MailchimpCampaignContent>(
        `/campaigns/${encodeURIComponent(campaignId)}/content`,
      );
    },

    async createCampaign(input: {
      listId: string;
      title: string;
      subjectLine: string;
      previewText?: string;
      fromName: string;
      replyTo: string;
      templateId?: number;
    }): Promise<MailchimpCampaignSummary> {
      const settings = mailchimpCampaignCreateSettings(input);
      return request<MailchimpCampaignSummary>("/campaigns", {
        method: "POST",
        body: JSON.stringify({
          type: "regular",
          recipients: { list_id: settings.listId },
          settings: {
            title: settings.title,
            subject_line: settings.subjectLine,
            preview_text: settings.previewText,
            from_name: settings.fromName,
            reply_to: settings.replyTo,
            ...(input.templateId ? { template_id: input.templateId } : {}),
          },
        }),
      });
    },

    async updateCampaignSettings(
      campaignId: string,
      input: {
        title: string;
        subjectLine: string;
        previewText?: string;
        fromName: string;
      },
    ): Promise<MailchimpCampaignSummary> {
      const title = input.title.trim() || "Untitled";
      return request<MailchimpCampaignSummary>(`/campaigns/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          settings: {
            title,
            subject_line: input.subjectLine.trim() || title,
            preview_text: input.previewText?.trim() ?? "",
            from_name: input.fromName.trim() || title || DEFAULT_MAILCHIMP_FROM_NAME,
          },
        }),
      });
    },

    async setCampaignContent(campaignId: string, html: string): Promise<void> {
      await request(`/campaigns/${encodeURIComponent(campaignId)}/content`, {
        method: "PUT",
        body: JSON.stringify({ html }),
      });
    },

    async applyCampaignTemplate(campaignId: string, templateId: number): Promise<void> {
      await request(`/campaigns/${encodeURIComponent(campaignId)}/content`, {
        method: "PUT",
        body: JSON.stringify({ template: { id: templateId } }),
      });
    },

    async deleteCampaign(campaignId: string): Promise<void> {
      await request(`/campaigns/${encodeURIComponent(campaignId)}`, {
        method: "DELETE",
      });
    },

    async listUserTemplates(): Promise<MailchimpTemplateSummary[]> {
      const out: MailchimpTemplateSummary[] = [];
      let offset = 0;
      for (;;) {
        const page = await request<MailchimpListResponse<MailchimpTemplateSummary>>(
          `/templates?type=user&count=${MAILCHIMP_LIST_PAGE_SIZE}&offset=${offset}`,
        );
        const batch = page.templates ?? [];
        out.push(...batch);
        if (batch.length < MAILCHIMP_LIST_PAGE_SIZE) {
          break;
        }
        offset += batch.length;
      }
      return out;
    },

    async getTemplate(templateId: string): Promise<MailchimpTemplateDetail> {
      return request<MailchimpTemplateDetail>(`/templates/${encodeURIComponent(templateId)}`);
    },

    async getTemplateDefaultContent(templateId: string): Promise<MailchimpTemplateDefaultContent> {
      return request<MailchimpTemplateDefaultContent>(
        `/templates/${encodeURIComponent(templateId)}/default-content`,
      );
    },

    async createTemplate(input: { name: string; html: string }): Promise<MailchimpTemplateDetail> {
      return request<MailchimpTemplateDetail>("/templates", {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          html: input.html,
        }),
      });
    },

    async updateTemplate(
      templateId: string,
      input: { name: string; html: string },
    ): Promise<MailchimpTemplateDetail> {
      return request<MailchimpTemplateDetail>(`/templates/${encodeURIComponent(templateId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: input.name,
          html: input.html,
        }),
      });
    },
  };
}

export type MailchimpHttpError = Error & { statusCode?: number };

export function mailchimpCampaignCreateSettings(input: {
  listId: string;
  title: string;
  subjectLine: string;
  previewText?: string;
  fromName: string;
  replyTo: string;
}): {
  listId: string;
  title: string;
  subjectLine: string;
  previewText: string;
  fromName: string;
  replyTo: string;
} {
  const title = input.title.trim() || "Untitled";
  return {
    listId: input.listId.trim(),
    title,
    subjectLine: input.subjectLine.trim() || title,
    previewText: input.previewText?.trim() ?? "",
    fromName: input.fromName.trim() || title || DEFAULT_MAILCHIMP_FROM_NAME,
    replyTo: input.replyTo.trim(),
  };
}

export function formatMailchimpApiErrorBody(body: string, status: number): string {
  const raw = body.trim();
  if (!raw) {
    return `Mailchimp API ${status}`;
  }
  try {
    const parsed = JSON.parse(raw) as {
      detail?: unknown;
      title?: unknown;
      errors?: Array<{ field?: unknown; message?: unknown }>;
    };
    const detail =
      (typeof parsed.detail === "string" && parsed.detail.trim()) ||
      (typeof parsed.title === "string" && parsed.title.trim()) ||
      "";
    const fieldErrors = (parsed.errors ?? [])
      .map((item) => {
        const field = typeof item.field === "string" ? item.field.trim() : "";
        const message = typeof item.message === "string" ? item.message.trim() : "";
        if (field && message) {
          return `${field}: ${message}`;
        }
        return message || field;
      })
      .filter((value) => value.length > 0);
    if (detail && fieldErrors.length > 0) {
      return `${detail} (${fieldErrors.join("; ")})`;
    }
    if (detail) {
      return detail;
    }
    if (fieldErrors.length > 0) {
      return fieldErrors.join("; ");
    }
  } catch {
    // Not JSON — fall through to a short raw snippet.
  }
  return raw.length > 240 ? `${raw.slice(0, 240)}…` : raw;
}

export function formatMailchimpApiError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return String(error);
}

export function mailchimpErrorStatusCode(error: unknown): number | undefined {
  if (error instanceof Error && "statusCode" in error) {
    const code = (error as MailchimpHttpError).statusCode;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}
