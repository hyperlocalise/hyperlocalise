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
import { hyperlocaliseManagedGatewayModelId } from "@/lib/providers/language-model";

/**
 * Blank CI/dispatch values must not win over the production default —
 * `??` only treats null/undefined, and GitHub Actions exports `""` when
 * the optional `eval_model` input is omitted.
 */
export function resolveEvalModel(configured: string | undefined): string {
  return configured?.trim() || hyperlocaliseManagedGatewayModelId;
}

/**
 * Model under evaluation. A Vercel AI Gateway model id so the eval lane can
 * matrix over candidates: `EVAL_MODEL=anthropic/claude-sonnet-4.5 vp run test:eval`.
 */
export const evalModel = resolveEvalModel(process.env.EVAL_MODEL);
