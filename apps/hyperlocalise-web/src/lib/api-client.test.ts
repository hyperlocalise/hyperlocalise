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
import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import { createApiClient } from "./api-client";

describe("createApiClient", () => {
  const client = createApiClient();
  const org = client.api.orgs[":organizationSlug"];

  it("exposes org, v1, and auth RPC paths as callable methods", () => {
    expect(typeof org.issues.$get).toBe("function");
    expect(typeof org["issue-sheet"].search.$get).toBe("function");
    expect(typeof org.notifications.$get).toBe("function");
    expect(typeof org["notification-preferences"].$get).toBe("function");
    expect(typeof org.mentions.$get).toBe("function");
    expect(typeof org.conversations.$get).toBe("function");
    expect(typeof org.glossaries.$get).toBe("function");
    expect(typeof org["knowledge-memory"].$get).toBe("function");
    expect(typeof org["translation-memories"].$get).toBe("function");
    expect(typeof org.projects.$get).toBe("function");
    expect(typeof org.jobs.$get).toBe("function");
    expect(typeof org.files.$post).toBe("function");
    expect(typeof org["workspace-files"].$get).toBe("function");
    expect(typeof org.automations.$get).toBe("function");
    expect(typeof org["external-tms-provider-credential"].$get).toBe("function");
    expect(typeof org["tms-provider"].connection.$get).toBe("function");
    expect(typeof org["tms-agent-automation"].organization.$get).toBe("function");
    expect(typeof org["tms-dashboard-summary"].$get).toBe("function");
    expect(typeof org["provider-credential"].$get).toBe("function");
    expect(typeof org["contentful-connections"].$get).toBe("function");
    expect(typeof org["mcp-server-connections"].$get).toBe("function");
    expect(typeof org["linked-domains"].$get).toBe("function");
    expect(typeof org["semrush-connections"].$get).toBe("function");
    expect(typeof org["ahrefs-connections"].$get).toBe("function");
    expect(typeof org["intercom-connections"].$get).toBe("function");
    expect(typeof org["canva-connections"].$get).toBe("function");
    expect(typeof org["agent-email"].$get).toBe("function");
    expect(typeof org["agent-slack"].$get).toBe("function");
    expect(typeof org["github-installation"].$get).toBe("function");
    expect(typeof org.teams.$get).toBe("function");
    expect(typeof org.members.$get).toBe("function");
    expect(typeof org.workspace.$get).toBe("function");
    expect(typeof org.billing["resource-usage"].$get).toBe("function");
    expect(typeof org["api-keys"].$get).toBe("function");
    expect(typeof client.api.v1.files.$post).toBe("function");
    expect(typeof client.api.v1.jobs.$post).toBe("function");
    expect(typeof client.api.auth.context.$get).toBe("function");
    expect(typeof client.api.auth.native.authorize.$get).toBe("function");
    expect(typeof client.api.auth.slack.callback.$get).toBe("function");
  });

  it("keeps typed $get/$post helpers on composed org paths", () => {
    expectTypeOf(org.projects.$get).toBeFunction();
    expectTypeOf(org.issues.$get).toBeFunction();
    expectTypeOf(org.glossaries.$get).toBeFunction();
    expectTypeOf(org["tms-provider"].connection.$get).toBeFunction();
    expectTypeOf(org["github-installation"].$get).toBeFunction();
    expectTypeOf(org.teams.$get).toBeFunction();
    expectTypeOf(org.files.$post).toBeFunction();
    expectTypeOf(client.api.v1.files.$post).toBeFunction();
    expectTypeOf(client.api.auth.context.$get).toBeFunction();
  });
});
