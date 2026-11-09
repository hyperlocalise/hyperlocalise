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

import { JOB_CHANGE_EVENT_TYPES } from "@/lib/job-change-events/job-change-events-contract";

const urlSchema = z.string().trim().min(1).max(2048);
const descriptionSchema = z.string().trim().max(500).nullable();
const eventTypesSchema = z.array(z.enum(JOB_CHANGE_EVENT_TYPES)).max(JOB_CHANGE_EVENT_TYPES.length);
const projectIdSchema = z.string().trim().min(1).max(128).nullable();

export const createWebhookEndpointBodySchema = z.object({
  url: urlSchema,
  description: descriptionSchema.optional(),
  eventTypes: eventTypesSchema.default([]),
  projectId: projectIdSchema.optional(),
});

export const updateWebhookEndpointBodySchema = z
  .object({
    url: urlSchema.optional(),
    description: descriptionSchema.optional(),
    eventTypes: eventTypesSchema.optional(),
    projectId: projectIdSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "Nothing to update.",
  });

export const webhookEndpointParamsSchema = z.object({
  endpointId: z.string().uuid(),
});

export type CreateWebhookEndpointBody = z.infer<typeof createWebhookEndpointBodySchema>;
export type UpdateWebhookEndpointBody = z.infer<typeof updateWebhookEndpointBodySchema>;
