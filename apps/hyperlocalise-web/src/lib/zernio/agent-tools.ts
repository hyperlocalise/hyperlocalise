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
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { isErr } from "@/lib/primitives/result/results";

import {
  buildZernioCreateBody,
  createZernioAd,
  createZernioCampaign,
  getZernioAd,
  listZernioAccounts,
  listZernioAds,
} from "./client";
import { ZERNIO_AD_GOALS } from "./types";

const jsonObjectSchema = z.record(z.string(), z.unknown());

const createAdInputSchema = z.object({
  accountId: z.string().trim().min(1).max(128),
  adAccountId: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(255),
  goal: z.enum(ZERNIO_AD_GOALS).optional(),
  budgetAmount: z.number().positive().optional(),
  budgetType: z.enum(["daily", "lifetime"]).optional(),
  headline: z.string().trim().min(1).max(255).optional(),
  body: z.string().trim().min(1).max(8000).optional(),
  linkUrl: z.string().trim().url().optional(),
  imageUrl: z.string().trim().url().optional(),
  callToAction: z.string().trim().min(1).max(64).optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  existingCampaignId: z.string().trim().min(1).max(128).optional(),
  adSetId: z.string().trim().min(1).max(128).optional(),
  targeting: jsonObjectSchema.optional(),
  extra: jsonObjectSchema.optional(),
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
  validateOnly: z.boolean().optional(),
});

const createCampaignInputSchema = z.object({
  accountId: z.string().trim().min(1).max(128),
  adAccountId: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(255),
  goal: z.enum(ZERNIO_AD_GOALS),
  budgetAmount: z.number().positive().optional(),
  budgetType: z.enum(["daily", "lifetime"]).optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  extra: jsonObjectSchema.optional(),
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
  validateOnly: z.boolean().optional(),
});

function serializeToolResult(value: unknown) {
  return JSON.stringify(value);
}

export function createZernioAdsToolSet(apiKey: string) {
  return {
    zernio_list_accounts: defineAgentTool({
      description:
        "List Zernio social and ads accounts. Use account _id values as accountId when creating ads.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await listZernioAccounts({ apiKey });
        if (isErr(result)) {
          throw new Error(result.error.message);
        }
        return serializeToolResult(result.value);
      },
    }),
    zernio_list_ads: defineAgentTool({
      description:
        "Read the Zernio ads tree (campaign → ad set → ad) with rolled-up metrics. Pass accountId to scope the tree.",
      inputSchema: z.object({
        accountId: z.string().trim().min(1).max(128).optional(),
      }),
      execute: async ({ accountId }) => {
        const result = await listZernioAds({ apiKey, accountId });
        if (isErr(result)) {
          throw new Error(result.error.message);
        }
        return serializeToolResult(result.value);
      },
    }),
    zernio_get_ad: defineAgentTool({
      description: "Get one Zernio ad by id, including creative, targeting, and metrics.",
      inputSchema: z.object({
        adId: z.string().trim().min(1).max(128),
      }),
      execute: async ({ adId }) => {
        const result = await getZernioAd({ apiKey, adId });
        if (isErr(result)) {
          throw new Error(result.error.message);
        }
        return serializeToolResult(result.value);
      },
    }),
    zernio_create_ad: defineAgentTool({
      description:
        "Create a paid ad with custom creative via POST /v1/ads/create. Creates campaign, ad set, and ad unless existingCampaignId or adSetId is set. Send idempotencyKey so retries do not duplicate spend.",
      inputSchema: createAdInputSchema,
      execute: async (input) => {
        const { extra, idempotencyKey, ...fields } = input;
        const result = await createZernioAd({
          apiKey,
          idempotencyKey,
          body: buildZernioCreateBody({ extra, fields }),
        });
        if (isErr(result)) {
          throw new Error(result.error.message);
        }
        return serializeToolResult(result.value);
      },
    }),
    zernio_create_campaign: defineAgentTool({
      description:
        "Create a standalone Zernio campaign without its first ad set. Ad sets join later via existingCampaignId on zernio_create_ad.",
      inputSchema: createCampaignInputSchema,
      execute: async (input) => {
        const { extra, idempotencyKey, ...fields } = input;
        const result = await createZernioCampaign({
          apiKey,
          idempotencyKey,
          body: buildZernioCreateBody({ extra, fields }),
        });
        if (isErr(result)) {
          throw new Error(result.error.message);
        }
        return serializeToolResult(result.value);
      },
    }),
  };
}

export const zernioCreateAdInputSchema = createAdInputSchema;
export const zernioCreateCampaignInputSchema = createCampaignInputSchema;
