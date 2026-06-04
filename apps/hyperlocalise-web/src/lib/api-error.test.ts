import { describe, expect, it } from "vite-plus/test";

import {
  ApiResponseError,
  isApiResponseErrorCode,
  readApiError,
  readApiResponseError,
} from "./api-error";

describe("api error helpers", () => {
  it("preserves the machine-readable error code separately from the display message", async () => {
    const error = await readApiResponseError(
      new Response(
        JSON.stringify({
          error: "crowdin_user_connection_required",
          message: "Sign in to Crowdin before continuing.",
        }),
        { status: 403 },
      ),
      "Failed to load projects",
    );

    expect(error).toBeInstanceOf(ApiResponseError);
    expect(error.message).toBe("Sign in to Crowdin before continuing.");
    expect(error.code).toBe("crowdin_user_connection_required");
    expect(error.status).toBe(403);
    expect(isApiResponseErrorCode(error, "crowdin_user_connection_required")).toBe(true);
  });

  it("keeps the legacy string helper returning the display message", async () => {
    await expect(
      readApiError(
        new Response(
          JSON.stringify({
            error: "project_not_found",
            message: "Project not found.",
          }),
          { status: 404 },
        ),
        "Failed to load project",
      ),
    ).resolves.toBe("Project not found.");
  });
});
