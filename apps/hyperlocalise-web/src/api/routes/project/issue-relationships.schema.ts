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

import { projectIdParamsSchema } from "./project.schema";

export const issueRelationshipParamsSchema = projectIdParamsSchema.extend({
  issueId: z.uuid(),
});

export const issueRelationshipIdParamsSchema = issueRelationshipParamsSchema.extend({
  relationshipId: z.uuid(),
});

export const issueRelationshipKindSchema = z.enum([
  "related",
  "blocks",
  "blocked_by",
  "duplicate_of",
]);

// Adds "duplicate": the read-only inverse of duplicate_of, shown when another
// issue was marked as a duplicate of this one. Only ever appears in reads
// (relationship rows, feed events), never accepted as request input.
export const issueRelationshipPresentedKindSchema = issueRelationshipKindSchema.or(
  z.literal("duplicate"),
);

export const issueRelationshipCreateBodySchema = z.object({
  relatedIssueId: z.uuid(),
  kind: issueRelationshipKindSchema,
});

export type IssueRelationshipCreateBody = z.infer<typeof issueRelationshipCreateBodySchema>;
