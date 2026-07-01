import { describe, expect, it } from "vite-plus/test";

import { getTmsProviderLiveErrorStatus } from "./tms-provider-live-error-response";

describe("getTmsProviderLiveErrorStatus", () => {
  it.each([
    ["crowdin_user_auth_invalid", 401],
    ["crowdin_user_connection_required", 401],
    ["crowdin_user_connection_auth_mode_mismatch", 401],
    ["phrase_user_auth_invalid", 401],
    ["phrase_user_connection_required", 401],
    ["crowdin_auth_invalid", 401],
    ["no_active_tms_provider", 404],
    ["invalid_encoded_job_id", 400],
    ["provider_fetcher_unavailable", 501],
    ["provider_description_edit_unsupported", 501],
    ["unknown_code", 500],
  ] as const)("maps %s to %i", (code, status) => {
    expect(getTmsProviderLiveErrorStatus(code)).toBe(status);
  });
});
