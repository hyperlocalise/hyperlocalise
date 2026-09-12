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
import { describe, expect, it, vi } from "vite-plus/test";

import { err, ok, type Result } from "@/lib/primitives/result/results";

import { createDefaultConfig } from "../catalog/node-catalog";
import {
  MISSING_WORKFLOW_CREDENTIAL,
  resolveSelectedNodeCredentials,
} from "./resolve-node-credentials";

describe("resolveSelectedNodeCredentials", () => {
  it("resolves secrets only for the selected node", async () => {
    const resolve = vi.fn(
      async (
        _organizationId: string,
        credentialId: string,
      ): Promise<Result<string, { code: "workflow_credential_not_found" }>> =>
        ok(`secret-for-${credentialId}`),
    );
    const cache = new Map<string, string>();
    const result = await resolveSelectedNodeCredentials({
      organizationId: "org-1",
      cache,
      resolve,
      node: {
        id: "http",
        type: "action.http",
        config: createDefaultConfig("action.http"),
        inputs: {
          "headers.Authorization": { kind: "secret", credentialId: "cred-live" },
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected credentials to resolve");
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith("org-1", "cred-live");
    expect(result.value.config).toMatchObject({
      headers: [{ key: "Authorization", value: "secret-for-cred-live" }],
    });
  });

  it("returns a typed failure when the selected credential is missing", async () => {
    const result = await resolveSelectedNodeCredentials({
      organizationId: "org-1",
      cache: new Map(),
      resolve: async () => err({ code: "workflow_credential_not_found" }),
      node: {
        id: "http",
        type: "action.http",
        config: {
          kind: "action.http",
          method: "GET",
          url: "https://example.com",
          onError: "stop",
          auth: { type: "bearer", credentialId: "missing" },
        },
      },
    });

    expect(result).toMatchObject({ ok: false, error: MISSING_WORKFLOW_CREDENTIAL });
  });
});
