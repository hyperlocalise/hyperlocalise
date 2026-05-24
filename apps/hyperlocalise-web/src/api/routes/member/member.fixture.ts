import type { AppType } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import type { testClient } from "hono/testing";

import type { InviteMemberBody } from "./member.schema";

type ApiClient = ReturnType<typeof testClient<AppType>>;

export function createMemberTestFixture(client: ApiClient) {
  const authFixture = createAuthTestFixture();
  const {
    authHeadersFor,
    cleanup: cleanupAuth,
    createWorkosIdentity,
    createWorkosIdentityForOrganization,
  } = authFixture;

  async function listMembersViaApi(
    identity: ReturnType<typeof createWorkosIdentity>,
    headers?: Awaited<ReturnType<typeof authHeadersFor>>,
  ) {
    return client.api.orgs[":organizationSlug"].members.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
      },
      { headers: headers ?? (await authHeadersFor(identity)) },
    );
  }

  async function inviteMemberViaApi(
    identity: ReturnType<typeof createWorkosIdentity>,
    body: InviteMemberBody,
    headers?: Awaited<ReturnType<typeof authHeadersFor>>,
  ) {
    return client.api.orgs[":organizationSlug"].members.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: body,
      },
      { headers: headers ?? (await authHeadersFor(identity)) },
    );
  }

  async function updateMemberRoleViaApi(
    identity: ReturnType<typeof createWorkosIdentity>,
    workosUserId: string,
    role: InviteMemberBody["role"],
    headers?: Awaited<ReturnType<typeof authHeadersFor>>,
  ) {
    return client.api.orgs[":organizationSlug"].members[":workosUserId"].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          workosUserId,
        },
        json: { role },
      },
      { headers: headers ?? (await authHeadersFor(identity)) },
    );
  }

  async function removeMemberViaApi(
    identity: ReturnType<typeof createWorkosIdentity>,
    workosUserId: string,
    headers?: Awaited<ReturnType<typeof authHeadersFor>>,
  ) {
    return client.api.orgs[":organizationSlug"].members[":workosUserId"].$delete(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          workosUserId,
        },
      },
      { headers: headers ?? (await authHeadersFor(identity)) },
    );
  }

  async function cleanup() {
    await cleanupAuth();
  }

  return {
    authHeadersFor,
    cleanup,
    createWorkosIdentity,
    createWorkosIdentityForOrganization,
    inviteMemberViaApi,
    listMembersViaApi,
    removeMemberViaApi,
    updateMemberRoleViaApi,
  };
}
