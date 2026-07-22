/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { z } from "zod";

export const taskSpecSchema = z.object({
  domain: z.enum(["translation", "repository", "provider_tms", "glossary", "project", "general"]),
  operation: z.enum(["answer", "inspect", "sync", "translate", "writeback"]),
  requiredCapabilities: z.array(z.string()).default([]),
  workspace: z.enum(["none", "repo_read"]).default("none"),
  mutationPolicy: z.enum(["none", "plan_only", "approval_required", "direct_write"]),
});

export type TaskSpec = z.infer<typeof taskSpecSchema>;
