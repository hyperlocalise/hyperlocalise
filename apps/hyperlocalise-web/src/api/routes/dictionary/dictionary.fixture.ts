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
import { randomUUID } from "node:crypto";

import type { AppType } from "@/api/typed-app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { testClient } from "hono/testing";

type Client = ReturnType<typeof testClient<AppType>>;

export function createDictionaryTestFixture(_client?: Client) {
  const authFixture = createAuthTestFixture();

  async function createStoredDictionaryFixture() {
    const { identity, organization, user } = await authFixture.createLocalWorkosIdentity();
    const [dictionary] = await db
      .insert(schema.spellcheckDictionaries)
      .values({
        organizationId: organization.id,
        createdByUserId: user.id,
        name: "Brand names",
        description: "Accepted brand tokens",
      })
      .returning();

    return { identity, organization, user, dictionary };
  }

  async function createNativeProject(
    organizationId: string,
    userId: string,
    name = "Dictionary Project",
  ) {
    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId,
        createdByUserId: userId,
        updatedByUserId: userId,
        name,
        identifier: uniqueTestProjectIdentifier(),
        source: "native",
        sourceLocale: "en-US",
        targetLocales: ["de-DE"],
        isActive: true,
      })
      .returning();
    return project;
  }

  return {
    authHeadersFor: authFixture.authHeadersFor,
    cleanup: authFixture.cleanup,
    createStoredDictionaryFixture,
    createNativeProject,
    createLocalWorkosIdentity: authFixture.createLocalWorkosIdentity,
    createWorkosIdentityForOrganization: authFixture.createWorkosIdentityForOrganization,
    createWorkosIdentityWithRole: authFixture.createWorkosIdentityWithRole,
  };
}
