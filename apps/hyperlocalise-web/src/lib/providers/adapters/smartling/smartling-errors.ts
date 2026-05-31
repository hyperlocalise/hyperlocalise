import { SmartlingApiError } from "./smartling-api";

export function mapSmartlingFetcherError(error: unknown): Error {
  if (error instanceof SmartlingApiError) {
    if (error.code === "smartling_auth_invalid" || error.status === 401) {
      return new Error("smartling_auth_invalid");
    }
    if (error.code === "smartling_api_unavailable") {
      return new Error("smartling_api_unavailable");
    }
  }
  return error instanceof Error ? error : new Error("smartling_request_failed");
}
