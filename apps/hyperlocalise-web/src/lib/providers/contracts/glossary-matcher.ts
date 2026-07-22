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
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type { NormalizedGlossaryMatch } from "@/lib/providers/contracts/glossary-match";

type ExternalTmsCredential =
  typeof import("@/lib/database/schema").organizationExternalTmsProviderCredentials.$inferSelect;

export type ExternalTmsGlossaryMatcherInput = {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  credential: ExternalTmsCredential;
  secretMaterial: string;
  glossaries: Array<{
    id: string;
    name: string;
    externalGlossaryId: string | null;
    targetLocale: string | null;
    termCapabilities: Record<string, unknown>;
  }>;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  limit: number;
};

export type ExternalTmsGlossaryMatcher = (
  input: ExternalTmsGlossaryMatcherInput,
) => Promise<NormalizedGlossaryMatch[]>;

export type GlossaryMatchResolution = {
  getProviderGlossaryMatcher: (
    providerKind: ExternalTmsProviderKind,
  ) => ExternalTmsGlossaryMatcher | null;
};
