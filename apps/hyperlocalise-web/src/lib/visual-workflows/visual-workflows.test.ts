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
import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";

import { getVisualWorkflowProjectName } from "./visual-workflows";

const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

async function seedOrganizationWithProject() {
  const { user, organization } = await syncWorkosIdentity(
    db,
    fixture.createWorkosIdentityWithRole("admin"),
  );
  const projectId = `vw-name-${organization.id.slice(0, 8)}`;
  await db.insert(schema.projects).values({
    id: projectId,
    identifier: uniqueTestProjectIdentifier(),
    organizationId: organization.id,
    createdByUserId: user.id,
    name: "Website",
  });
  return { organizationId: organization.id, projectId };
}

describe("getVisualWorkflowProjectName", () => {
  it("names a project of the organization and nothing for another organization's", async () => {
    const own = await seedOrganizationWithProject();
    const other = await seedOrganizationWithProject();

    await expect(getVisualWorkflowProjectName(own)).resolves.toBe("Website");
    await expect(
      getVisualWorkflowProjectName({
        organizationId: own.organizationId,
        projectId: other.projectId,
      }),
    ).resolves.toBeNull();
  });
});
