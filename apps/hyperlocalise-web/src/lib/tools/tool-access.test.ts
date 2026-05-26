import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database";

import { toolCanAccessStoredFileProject } from "@/lib/tools/tool-access";
import type { ToolContext } from "@/lib/tools/types";

const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

describe("tool stored file access", () => {
  it("allows members to access organization-scoped stored files", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    await fixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;

    const ctx: ToolContext = {
      conversationId: "conv_test",
      organizationId: auth.activeOrganization.localOrganizationId,
      localUserId: auth.user.localUserId,
      membershipRole: "member",
      projectId: null,
      db,
    };

    await expect(toolCanAccessStoredFileProject(ctx, null)).resolves.toBe(true);
  });
});
