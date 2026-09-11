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

import { listHttpSecretBindings, upsertHttpSecretBinding } from "./workflow-data-panel";

describe("http secret bindings", () => {
  it("lists only header and body secret bindings", () => {
    expect(
      listHttpSecretBindings({
        url: { kind: "literal", value: "https://example.com" },
        "headers.Authorization": { kind: "secret", credentialId: "cred-1" },
        "body.token": { kind: "secret", credentialId: "cred-2" },
      }).map(([name]) => name),
    ).toEqual(["headers.Authorization", "body.token"]);
  });

  it("removes the previous secret when renaming the only target", () => {
    expect(
      upsertHttpSecretBinding({
        inputs: { "headers.Authorization": { kind: "secret", credentialId: "cred-1" } },
        target: "body.token",
        credentialId: "cred-1",
      }),
    ).toEqual({
      "body.token": { kind: "secret", credentialId: "cred-1" },
    });
  });

  it("keeps additional secrets when adding another target", () => {
    expect(
      upsertHttpSecretBinding({
        inputs: {
          "headers.Authorization": { kind: "secret", credentialId: "cred-1" },
          "headers.X-API-Key": { kind: "secret", credentialId: "cred-2" },
        },
        target: "body.token",
        credentialId: "cred-3",
      }),
    ).toEqual({
      "headers.Authorization": { kind: "secret", credentialId: "cred-1" },
      "headers.X-API-Key": { kind: "secret", credentialId: "cred-2" },
      "body.token": { kind: "secret", credentialId: "cred-3" },
    });
  });
});
