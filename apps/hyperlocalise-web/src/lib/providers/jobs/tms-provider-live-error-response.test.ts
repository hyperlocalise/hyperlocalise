import { describe, expect, it } from "vite-plus/test";

import { TmsProviderLivePartialCreateError } from "./tms-provider-live-error";
import {
  getTmsProviderLiveErrorStatus,
  tmsProviderLiveErrorResponse,
} from "./tms-provider-live-error-response";

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
    ["invalid_smartling_project_id", 400],
    ["invalid_smartling_string_id", 400],
    ["smartling_auth_invalid", 401],
    ["provider_fetcher_unavailable", 501],
    ["provider_description_edit_unsupported", 501],
    ["provider_task_create_partial", 500],
    ["unknown_code", 500],
  ] as const)("maps %s to %i", (code, status) => {
    expect(getTmsProviderLiveErrorStatus(code)).toBe(status);
  });
});

describe("tmsProviderLiveErrorResponse", () => {
  it("includes created jobs for partial provider create failures", async () => {
    const jobs = [{ id: "job-1" }, { id: "job-2" }];
    let captured: { body: unknown; status: number } | null = null;
    const c = {
      json(body: object, status: number) {
        captured = { body, status };
        return new Response(JSON.stringify(body), { status }) as never;
      },
    };

    tmsProviderLiveErrorResponse(
      c,
      new TmsProviderLivePartialCreateError(
        "Created 2 of 3 jobs, then failed: boom",
        jobs.length,
        jobs,
      ),
    );

    expect(captured).toEqual({
      status: 500,
      body: {
        error: "provider_task_create_partial",
        message: "Created 2 of 3 jobs, then failed: boom",
        createdCount: 2,
        jobs,
      },
    });
  });
});
