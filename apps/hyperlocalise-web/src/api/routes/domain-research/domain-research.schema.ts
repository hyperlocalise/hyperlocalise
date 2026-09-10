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

const keywordIntentSchema = z.enum([
  "informational",
  "commercial",
  "transactional",
  "navigational",
]);

export const domainResearchKeywordSchema = z.object({
  keyword: z.string().trim().min(1).max(200),
  volume: z.number().int().nonnegative().optional().default(0),
  kd: z.number().int().nonnegative().optional().default(0),
  cpc: z.number().nonnegative().optional().default(0),
  intent: keywordIntentSchema.optional().default("informational"),
});

export const expandDomainResearchBodySchema = z.object({
  seedKeyword: z.string().trim().min(1).max(200),
  marketId: z.string().trim().min(1).max(64),
});

export const saveDomainResearchKeywordsBodySchema = z.object({
  marketId: z.string().trim().min(1).max(64),
  seedKeyword: z.string().trim().min(1).max(200).optional(),
  keywords: z.array(domainResearchKeywordSchema).min(1).max(100),
});

export const inspectDomainResearchSerpBodySchema = z.object({
  keyword: z.string().trim().min(1).max(200),
  marketId: z.string().trim().min(1).max(64),
});

export const trackDomainResearchKeywordsBodySchema = z.object({
  marketId: z.string().trim().min(1).max(64),
  keywords: z.array(domainResearchKeywordSchema).min(1).max(20),
});
