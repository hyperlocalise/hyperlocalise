import { describe, expect, it } from "vite-plus/test";

import { mapProviderQaErrorToHttpStatus } from "./map-provider-qa-http-error";

describe("mapProviderQaErrorToHttpStatus", () => {
  it("maps provider configuration errors to 400", () => {
    expect(mapProviderQaErrorToHttpStatus(new Error("provider_credential_not_found"))).toBe(400);
    expect(mapProviderQaErrorToHttpStatus(new Error("invalid_crowdin_project_id"))).toBe(400);
    expect(mapProviderQaErrorToHttpStatus(new Error("crowdin_auth_invalid"))).toBe(400);
  });

  it("maps transient infrastructure errors to 503", () => {
    expect(
      mapProviderQaErrorToHttpStatus(new Error("Phrase returned HTTP 429 while listing files")),
    ).toBe(503);
    expect(mapProviderQaErrorToHttpStatus(new Error("Phrase health check timed out"))).toBe(503);
  });

  it("maps sandbox and QA execution failures to 500", () => {
    expect(mapProviderQaErrorToHttpStatus(new Error("hl check failed (exit 1): boom"))).toBe(500);
    expect(
      mapProviderQaErrorToHttpStatus(
        new Error("hl check report is not valid JSON: Unexpected token"),
      ),
    ).toBe(500);
  });
});
