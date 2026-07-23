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
import { describe, expect, it } from "vite-plus/test";

import { ApiResponseError } from "@/lib/api-error";

import { readTmsProviderListResponse } from "./tms-provider-list-fetch";

describe("readTmsProviderListResponse", () => {
  it("returns an empty list when no TMS provider is connected", async () => {
    const response = new Response(JSON.stringify({ error: "no_active_tms_provider" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });

    await expect(readTmsProviderListResponse(response, "projects", "Failed")).resolves.toEqual([]);
  });

  it("throws for other TMS list failures", async () => {
    const response = new Response(
      JSON.stringify({ error: "crowdin_user_connection_required", message: "Connect Crowdin" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );

    await expect(
      readTmsProviderListResponse(response, "jobs", "Failed to load TMS jobs"),
    ).rejects.toBeInstanceOf(ApiResponseError);
  });

  it("returns list items from a successful response", async () => {
    const response = new Response(JSON.stringify({ projects: [{ id: "1" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    await expect(readTmsProviderListResponse(response, "projects", "Failed")).resolves.toEqual([
      { id: "1" },
    ]);
  });
});
