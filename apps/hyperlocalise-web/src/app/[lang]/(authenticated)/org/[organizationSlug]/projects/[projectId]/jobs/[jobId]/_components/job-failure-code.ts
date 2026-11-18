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
import type { MessageDescriptor } from "react-intl";

import { jobFailureCodeMessages as messages } from "./job-failure-code.messages";

const MESSAGE_BY_CODE: Record<string, MessageDescriptor> = {
  sandbox_timeout: messages.timedOut,
  timeout: messages.timedOut,
  leftover_locales: messages.leftoverLocales,
  source_file_not_found: messages.sourceFileMissing,
  source_file_unavailable: messages.sourceFileUnavailable,
  source_text_unavailable: messages.sourceTextUnavailable,
  invalid_source_file: messages.sourceFileInvalid,
  parse_failed: messages.sourceFileInvalid,
  invalid_file_job_input: messages.invalidJob,
  invalid_key_translation_job_input: messages.invalidJob,
  unsupported_job_type: messages.invalidJob,
  translation_project_not_found: messages.projectMissing,
  image_translation_failed: messages.imageFailed,
  ai_credit_exhausted: messages.creditsExhausted,
  ai_features_required: messages.aiDisabled,
  ai_credit_pricing_not_configured: messages.aiCheckFailed,
  ai_features_check_failed: messages.aiCheckFailed,
  office_file_manual_cat: messages.editorOnly,
  file_translation_failed: messages.translationFailed,
  translation_execution_failed: messages.translationFailed,
};

/** Plain-language reason for a job failure code, or null when the code is unknown. */
export function jobFailureCodeMessage(code: string | null | undefined): MessageDescriptor | null {
  return code ? (MESSAGE_BY_CODE[code] ?? null) : null;
}
