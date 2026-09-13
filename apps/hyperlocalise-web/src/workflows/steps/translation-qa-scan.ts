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
import type { TranslationQaScanEventData } from "@/lib/workflow/types";

export async function scanTranslationQaPageStep(input: {
  runId: string;
  organizationId: string;
  projectId: string;
  afterKeyId: string | null;
}) {
  "use step";
  const { scanTranslationQaPage } = await import("@/lib/qa/run-project-qa-scan");
  return scanTranslationQaPage(input);
}

export async function completeTranslationQaScanStep(input: TranslationQaScanEventData) {
  "use step";
  const { completeTranslationQaScan } = await import("@/lib/qa/run-project-qa-scan");
  return completeTranslationQaScan(input);
}

export async function failTranslationQaScanStep(input: {
  runId: string;
  errorCode: string;
  errorMessage: string;
}) {
  "use step";
  const { failTranslationQaRun } = await import("@/lib/qa/run-project-qa-scan");
  return failTranslationQaRun(input);
}
