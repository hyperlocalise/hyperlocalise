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
  APIError,
  LoopsClient as SdkLoopsClient,
  RateLimitExceededError,
  type CampaignResponse,
  type CreateCampaignResponse,
  type EmailMessageResponse,
  type SimplifiedWorkflow,
  type TransactionalDraftResponse,
  type TransactionalEmailResource,
  type WorkflowSummary,
} from "loops";

import { LOOPS_LIST_PER_PAGE } from "./constants";

export class LoopsApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(input: { message: string; status: number; code?: string }) {
    super(input.message);
    this.name = "LoopsApiError";
    this.status = input.status;
    this.code = input.code ?? "loops_api_error";
  }
}

/** Thrown when an email message uses legacy MJML and cannot be read as LMX. */
export function isLoopsLegacyContentError(error: unknown): boolean {
  if (!(error instanceof LoopsApiError)) {
    return false;
  }
  return error.code === "loops_legacy_content" || error.status === 409;
}

/**
 * Loops rejects `languageCode` when translations are not enabled for the team
 * (`400 - Translations are not enabled for this team.`). The translated content
 * still lands; only the language label is lost, so callers retry without it.
 */
export function isLoopsLanguageLabelUnsupportedError(error: unknown): boolean {
  if (!(error instanceof LoopsApiError)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes("languagecode") || message.includes("translations are not enabled");
}

/**
 * A `SendEmailAction` node inside a workflow graph. The SDK has no dedicated
 * type for this derived read, so it stays local.
 */
export type LoopsWorkflowEmailNode = {
  nodeId: string;
  emailMessageId: string;
};

export type LoopsClient = {
  listTransactionalEmails: () => Promise<TransactionalEmailResource[]>;
  getEmailMessage: (emailMessageId: string) => Promise<EmailMessageResponse>;
  listCampaigns: () => Promise<CampaignResponse[]>;
  listWorkflows: () => Promise<WorkflowSummary[]>;
  listWorkflowEmailNodes: (workflowId: string) => Promise<LoopsWorkflowEmailNode[]>;
  createTransactionalEmail: (name: string) => Promise<TransactionalDraftResponse>;
  updateEmailMessage: (input: {
    emailMessageId: string;
    expectedRevisionId: string;
    subject?: string;
    previewText?: string;
    languageCode?: string;
    lmx: string;
  }) => Promise<EmailMessageResponse>;
  createCampaign: (name: string) => Promise<CreateCampaignResponse>;
  createWorkflow: (name: string) => Promise<SimplifiedWorkflow>;
  ensureTransactionalDraft: (transactionalId: string) => Promise<TransactionalDraftResponse>;
  getCampaign: (campaignId: string) => Promise<CampaignResponse>;
};

type LoopsFetch = typeof fetch;

type PaginatedResponse<T> = {
  pagination: { nextCursor: string | null };
  data: T[];
};

/**
 * The official Loops SDK reads the global `fetch`, so tests inject a stub by
 * swapping it for the duration of one SDK call. Production always uses the
 * real global fetch.
 */
async function withFetchImpl<T>(
  fetchImpl: LoopsFetch | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (!fetchImpl || fetchImpl === globalThis.fetch) {
    return run();
  }
  const previous = globalThis.fetch;
  globalThis.fetch = fetchImpl as typeof globalThis.fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = previous;
  }
}

function toLoopsApiError(error: unknown): unknown {
  if (error instanceof LoopsApiError) {
    return error;
  }
  if (error instanceof RateLimitExceededError) {
    return new LoopsApiError({
      message: error.message,
      status: 429,
      code: "loops_rate_limited",
    });
  }
  if (error instanceof APIError) {
    if (error.statusCode === 409) {
      return new LoopsApiError({
        message: "Loops content is stored in a legacy format and cannot be read as LMX.",
        status: 409,
        code: "loops_legacy_content",
      });
    }
    return new LoopsApiError({
      message: error.message || `Loops request failed with status ${error.statusCode}.`,
      status: error.statusCode,
    });
  }
  return error;
}

function readWorkflowEmailNodes(workflow: SimplifiedWorkflow): LoopsWorkflowEmailNode[] {
  return Object.entries(workflow.nodes ?? {}).flatMap(([nodeId, node]) => {
    const fields = node as unknown as Record<string, unknown>;
    const config = fields.config as Record<string, unknown> | undefined;
    const emailMessageId = fields.emailMessageId ?? config?.emailMessageId;
    if (typeof emailMessageId !== "string" || emailMessageId.length === 0 || !nodeId) {
      return [];
    }
    return [{ nodeId, emailMessageId }];
  });
}

async function listPaginated<T>(input: {
  fetchImpl: LoopsFetch | undefined;
  run: (args: { perPage: number; cursor?: string }) => Promise<PaginatedResponse<T>>;
}): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const response = await withFetchImpl(input.fetchImpl, () =>
      input.run({ perPage: LOOPS_LIST_PER_PAGE, ...(cursor ? { cursor } : {}) }),
    ).catch((error: unknown) => {
      throw toLoopsApiError(error);
    });
    out.push(...response.data);
    const next = response.pagination?.nextCursor;
    if (typeof next !== "string" || next.length === 0) {
      break;
    }
    cursor = next;
  }
  return out;
}

function requireId(item: { id: string }, resource: string): void {
  if (!item.id) {
    throw new LoopsApiError({
      message: `Loops returned a ${resource} without an id.`,
      status: 200,
    });
  }
}

export function createLoopsClient(input: { apiKey: string; fetchImpl?: LoopsFetch }): LoopsClient {
  const sdk = new SdkLoopsClient(input.apiKey.trim());
  const fetchImpl = input.fetchImpl;
  const call = <T>(run: (sdk: SdkLoopsClient) => Promise<T>): Promise<T> =>
    withFetchImpl(fetchImpl, () => run(sdk)).catch((error: unknown) => {
      throw toLoopsApiError(error);
    });
  return {
    async listTransactionalEmails() {
      const items = await listPaginated({
        fetchImpl,
        run: (args) => sdk.listTransactionalEmails(args),
      });
      for (const item of items) {
        requireId(item, "transactional email");
      }
      return items;
    },
    async getEmailMessage(emailMessageId: string) {
      const message = await call((sdk) => sdk.getEmailMessage(emailMessageId));
      requireId(message, "email message");
      return message;
    },
    async listCampaigns() {
      const items = await listPaginated({
        fetchImpl,
        run: (args) => sdk.listCampaigns(args),
      });
      for (const item of items) {
        requireId(item, "campaign");
      }
      return items;
    },
    async listWorkflows() {
      const items = await listPaginated({
        fetchImpl,
        run: (args) => sdk.listWorkflows(args),
      });
      for (const item of items) {
        requireId(item, "workflow");
      }
      return items;
    },
    async listWorkflowEmailNodes(workflowId: string) {
      const workflow = await call((sdk) => sdk.getWorkflow(workflowId));
      return readWorkflowEmailNodes(workflow);
    },
    async createTransactionalEmail(name: string) {
      const created = await call((sdk) => sdk.createTransactionalEmail({ name }));
      requireId(created, "transactional email");
      return created;
    },
    async updateEmailMessage(update) {
      return call((sdk) =>
        sdk.updateEmailMessage(update.emailMessageId, {
          expectedRevisionId: update.expectedRevisionId,
          ...(update.subject !== undefined ? { subject: update.subject } : {}),
          ...(update.previewText !== undefined ? { previewText: update.previewText } : {}),
          ...(update.languageCode !== undefined ? { languageCode: update.languageCode } : {}),
          lmx: update.lmx,
        }),
      );
    },
    async createCampaign(name: string) {
      const created = await call((sdk) => sdk.createCampaign({ name }));
      requireId(created, "campaign");
      return created;
    },
    async createWorkflow(name: string) {
      const created = await call((sdk) => sdk.createWorkflow({ name }));
      requireId(created, "workflow");
      return created;
    },
    async ensureTransactionalDraft(transactionalId: string) {
      return call((sdk) => sdk.ensureTransactionalEmailDraft(transactionalId));
    },
    async getCampaign(campaignId: string) {
      const campaign = await call((sdk) => sdk.getCampaign(campaignId));
      return { ...campaign, id: campaign.id || campaignId };
    },
  };
}
