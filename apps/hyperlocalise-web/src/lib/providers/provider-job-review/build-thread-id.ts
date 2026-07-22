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
import type { ProviderReviewThreadKind } from "./types";

export function buildProviderReviewThreadId(input: {
  providerKind: string;
  externalProjectId: string;
  externalJobId: string;
  kind: ProviderReviewThreadKind;
  externalThreadId: string;
}) {
  return [
    input.providerKind,
    input.externalProjectId,
    input.externalJobId,
    input.kind,
    input.externalThreadId,
  ].join(":");
}
