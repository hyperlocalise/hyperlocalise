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
  total_items?: number;
};

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
  };
  recipients?: { list_id?: string };
};

export type MailchimpCampaignContent = {
  html?: string;
};

export type MailchimpTemplateSummary = {
  id: number;
  name: string;
  type: string;
};

export type MailchimpTemplateDetail = {
  id: number;
  name: string;
  html: string;
  edited_on?: string;
  created_on?: string;
};

export type MailchimpClient = ReturnType<typeof createMailchimpClient>;

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
      const error = new Error(`mailchimp_api_${response.status}:${body.slice(0, 200)}`);
      (error as MailchimpHttpError).statusCode = response.status;
      throw error;
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  return {
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
    }): Promise<MailchimpCampaignSummary> {
      return request<MailchimpCampaignSummary>("/campaigns", {
        method: "POST",
        body: JSON.stringify({
          type: "regular",
          recipients: { list_id: input.listId },
          settings: {
            title: input.title,
            subject_line: input.subjectLine,
            preview_text: input.previewText ?? "",
            from_name: input.fromName,
            reply_to: input.replyTo,
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

export function mailchimpErrorStatusCode(error: unknown): number | undefined {
  if (error instanceof Error && "statusCode" in error) {
    const code = (error as MailchimpHttpError).statusCode;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}
