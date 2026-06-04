import { TmsProviderLiveError } from "@/lib/providers/tms-provider-live";

export function getTmsProviderLiveErrorStatus(code: string): number {
  switch (code) {
    case "no_active_tms_provider":
      return 404;
    case "crowdin_auth_invalid":
    case "crowdin_user_auth_invalid":
    case "crowdin_user_connection_required":
      return 401;
    case "invalid_encoded_job_id":
      return 400;
    case "provider_fetcher_unavailable":
    case "provider_description_edit_unsupported":
      return 501;
    default:
      return 500;
  }
}

export function tmsProviderLiveErrorResponse(
  c: { json: (body: unknown, status: number) => Response },
  error: unknown,
): Response {
  if (error instanceof TmsProviderLiveError) {
    return c.json(
      { error: error.code, message: error.message },
      getTmsProviderLiveErrorStatus(error.code),
    );
  }

  throw error;
}
