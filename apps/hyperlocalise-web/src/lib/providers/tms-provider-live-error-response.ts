import type { TypedResponse } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { TmsProviderLiveError } from "@/lib/providers/tms-provider-live";

type JsonContext = {
  json<T extends object, U extends ContentfulStatusCode>(
    body: T,
    status: U,
  ): Response & TypedResponse<T, U, "json">;
};

export type TmsProviderLiveErrorStatus = 400 | 401 | 404 | 500 | 501;
export type TmsProviderLiveErrorBody = { error: string; message: string };

export function getTmsProviderLiveErrorStatus(code: string): TmsProviderLiveErrorStatus {
  switch (code) {
    case "no_active_tms_provider":
      return 404;
    case "crowdin_auth_invalid":
    case "crowdin_user_auth_invalid":
    case "crowdin_user_connection_required":
    case "phrase_user_auth_invalid":
    case "phrase_user_connection_required":
    case "lokalise_user_auth_invalid":
    case "lokalise_user_connection_required":
      return 401;
    case "invalid_encoded_job_id":
      return 400;
    case "provider_fetcher_unavailable":
    case "provider_description_edit_unsupported":
    case "provider_comments_read_unsupported":
      return 501;
    default:
      return 500;
  }
}

export function tmsProviderLiveErrorResponse(
  c: JsonContext,
  error: unknown,
): Response & TypedResponse<TmsProviderLiveErrorBody, TmsProviderLiveErrorStatus, "json"> {
  if (error instanceof TmsProviderLiveError) {
    return c.json(
      { error: error.code, message: error.message },
      getTmsProviderLiveErrorStatus(error.code),
    );
  }

  throw error;
}
