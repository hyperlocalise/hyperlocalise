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
import type { TypedResponse } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import {
  TmsProviderLiveError,
  TmsProviderLivePartialCreateError,
} from "@/lib/providers/jobs/tms-provider-live-error";

type JsonContext = {
  json<T extends object, U extends ContentfulStatusCode>(
    body: T,
    status: U,
  ): Response & TypedResponse<T, U, "json">;
};

export type TmsProviderLiveErrorStatus = 207 | 400 | 401 | 404 | 500 | 501;
export type TmsProviderLiveErrorBody = {
  error: string;
  message: string;
  createdCount?: number;
  jobs?: unknown[];
};

export function getTmsProviderLiveErrorStatus(code: string): TmsProviderLiveErrorStatus {
  switch (code) {
    case "no_active_tms_provider":
      return 404;
    case "crowdin_auth_invalid":
    case "crowdin_user_auth_invalid":
    case "crowdin_user_connection_required":
    case "crowdin_user_connection_auth_mode_mismatch":
    case "phrase_auth_invalid":
    case "phrase_user_auth_invalid":
    case "phrase_user_connection_required":
    case "lokalise_user_auth_invalid":
    case "lokalise_user_connection_required":
    case "smartling_auth_invalid":
      return 401;
    case "invalid_encoded_job_id":
    case "invalid_crowdin_project_or_file_id":
    case "invalid_crowdin_project_or_string_id":
    case "invalid_phrase_project_id":
    case "invalid_smartling_project_id":
    case "invalid_smartling_string_id":
    case "invalid_smartling_comment_id":
    case "phrase_target_locale_not_found":
      return 400;
    case "provider_fetcher_unavailable":
    case "provider_description_edit_unsupported":
    case "provider_comments_read_unsupported":
    case "provider_cat_unsupported":
    case "provider_cat_all_files_unsupported":
      return 501;
    case "provider_task_create_partial":
      return 207;
    default:
      return 500;
  }
}

export function tmsProviderLiveErrorResponse(
  c: JsonContext,
  error: unknown,
): Response & TypedResponse<TmsProviderLiveErrorBody, TmsProviderLiveErrorStatus, "json"> {
  if (error instanceof TmsProviderLivePartialCreateError) {
    return c.json(
      {
        error: error.code,
        message: error.message,
        createdCount: error.createdCount,
        jobs: error.jobs,
      },
      getTmsProviderLiveErrorStatus(error.code),
    );
  }

  if (error instanceof TmsProviderLiveError) {
    return c.json(
      { error: error.code, message: error.message },
      getTmsProviderLiveErrorStatus(error.code),
    );
  }

  throw error;
}
