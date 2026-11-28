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
import { createHmac } from "node:crypto";

import { describe, expect, it } from "vite-plus/test";

import {
  bitbucketPayloadRepositoryUuid,
  bitbucketPushedBranches,
  bitbucketWebhookSecret,
  bitbucketWebhookUrl,
  verifyBitbucketSignature,
} from "./webhooks";

function sign(body: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("Bitbucket webhooks", () => {
  it("derives a different secret for each project", () => {
    expect(bitbucketWebhookSecret("project_a")).not.toBe(bitbucketWebhookSecret("project_b"));
    expect(bitbucketWebhookSecret("project_a")).toBe(bitbucketWebhookSecret("project_a"));
  });

  it("verifies Bitbucket's signature over the raw body only", () => {
    const secret = bitbucketWebhookSecret("project_a");
    const body = '{"push":{}}';

    expect(verifyBitbucketSignature({ body, signature: sign(body, secret), secret })).toBe(true);
    expect(
      verifyBitbucketSignature({ body: `${body} `, signature: sign(body, secret), secret }),
    ).toBe(false);
    expect(
      verifyBitbucketSignature({
        body,
        signature: sign(body, bitbucketWebhookSecret("project_b")),
        secret,
      }),
    ).toBe(false);
    expect(verifyBitbucketSignature({ body, signature: undefined, secret })).toBe(false);
    expect(verifyBitbucketSignature({ body, signature: "sha1=abc", secret })).toBe(false);
  });

  it("reads the pushed branches, leaving out tags and deleted branches", () => {
    const payload = {
      repository: { uuid: "{r1}" },
      push: {
        changes: [
          { new: { type: "branch", name: "main" } },
          { new: { type: "tag", name: "v1.0" } },
          { new: null, old: { type: "branch", name: "gone" } },
        ],
      },
    };

    expect(bitbucketPushedBranches(payload)).toEqual(["main"]);
    expect(bitbucketPayloadRepositoryUuid(payload)).toBe("{r1}");
    expect(bitbucketPushedBranches({})).toEqual([]);
  });

  it("builds the delivery address from the app origin and project", () => {
    expect(bitbucketWebhookUrl("https://app.test", "project/1")).toBe(
      "https://app.test/api/webhooks/bitbucket/content-sync/project%2F1",
    );
  });
});
