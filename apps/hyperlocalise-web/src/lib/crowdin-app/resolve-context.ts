/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { createLogger } from "@/lib/log";
import { encodeProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
import type { VerifiedCrowdinAppJwt } from "@/lib/crowdin-app/jwt";

const logger = createLogger("crowdin-app-resolve");

export type CrowdinAppResolveError =
  | "crowdin_org_not_linked"
  | "crowdin_org_ambiguous"
  | "crowdin_user_not_linked"
  | "crowdin_project_not_linked"
  | "organization_slug_missing";

export type CrowdinAppResolvedContext = {
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  userId: string;
  userEmail: string;
  projectId: string;
  projectName: string;
  crowdinUserId: number;
  crowdinOrganizationId: number;
  crowdinProjectId: number;
};

async function backfillExternalOrganizationId(input: {
  credentialId: string;
  crowdinOrganizationId: number;
}) {
  await db
    .update(schema.organizationExternalTmsProviderCredentials)
    .set({
      externalOrganizationId: String(input.crowdinOrganizationId),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.id, input.credentialId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, "crowdin"),
      ),
    );
}

async function resolveOrganizationFromCrowdinOrg(crowdinOrganizationId: number) {
  const byExternalId = await db
    .select({
      credentialId: schema.organizationExternalTmsProviderCredentials.id,
      organizationId: schema.organizations.id,
      organizationSlug: schema.organizations.slug,
      organizationName: schema.organizations.name,
    })
    .from(schema.organizationExternalTmsProviderCredentials)
    .innerJoin(
      schema.organizations,
      eq(schema.organizationExternalTmsProviderCredentials.organizationId, schema.organizations.id),
    )
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, "crowdin"),
        eq(
          schema.organizationExternalTmsProviderCredentials.externalOrganizationId,
          String(crowdinOrganizationId),
        ),
        eq(schema.organizations.lifecycleStatus, "active"),
      ),
    )
    .limit(2);

  if (byExternalId.length > 1) {
    return { error: "crowdin_org_ambiguous" as const };
  }
  if (byExternalId.length === 1) {
    return { value: byExternalId[0]! };
  }

  return null;
}

async function resolveOrganizationFromUserConnection(crowdinUserId: number) {
  const connections = await db
    .select({
      credentialId: schema.organizationExternalTmsProviderCredentials.id,
      organizationId: schema.organizations.id,
      organizationSlug: schema.organizations.slug,
      organizationName: schema.organizations.name,
      externalOrganizationId:
        schema.organizationExternalTmsProviderCredentials.externalOrganizationId,
    })
    .from(schema.crowdinUserConnections)
    .innerJoin(
      schema.organizations,
      eq(schema.crowdinUserConnections.organizationId, schema.organizations.id),
    )
    .innerJoin(
      schema.organizationExternalTmsProviderCredentials,
      and(
        eq(
          schema.organizationExternalTmsProviderCredentials.id,
          schema.crowdinUserConnections.providerCredentialId,
        ),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, "crowdin"),
      ),
    )
    .where(
      and(
        eq(schema.crowdinUserConnections.crowdinUserId, crowdinUserId),
        eq(schema.organizations.lifecycleStatus, "active"),
      ),
    )
    .limit(3);

  if (connections.length === 0) {
    return { error: "crowdin_user_not_linked" as const };
  }
  if (connections.length > 1) {
    const uniqueOrgs = new Set(connections.map((row) => row.organizationId));
    if (uniqueOrgs.size > 1) {
      return { error: "crowdin_org_ambiguous" as const };
    }
  }

  return { value: connections[0]! };
}

export async function resolveCrowdinAppContext(
  claims: VerifiedCrowdinAppJwt,
): Promise<CrowdinAppResolvedContext | { error: CrowdinAppResolveError }> {
  const orgFromCredential = await resolveOrganizationFromCrowdinOrg(claims.crowdinOrganizationId);

  let organization:
    | {
        credentialId: string;
        organizationId: string;
        organizationSlug: string | null;
        organizationName: string;
        externalOrganizationId?: string | null;
      }
    | undefined;

  if (orgFromCredential && "error" in orgFromCredential) {
    return { error: orgFromCredential.error as CrowdinAppResolveError };
  }

  if (orgFromCredential?.value) {
    organization = orgFromCredential.value;
  } else {
    const fromUser = await resolveOrganizationFromUserConnection(claims.crowdinUserId);
    if ("error" in fromUser) {
      if (fromUser.error === "crowdin_user_not_linked") {
        return { error: "crowdin_org_not_linked" };
      }
      return { error: fromUser.error as CrowdinAppResolveError };
    }
    organization = fromUser.value;
    if (!organization.externalOrganizationId) {
      await backfillExternalOrganizationId({
        credentialId: organization.credentialId,
        crowdinOrganizationId: claims.crowdinOrganizationId,
      });
      logger.info(
        {
          organizationId: organization.organizationId,
          crowdinOrganizationId: claims.crowdinOrganizationId,
          credentialId: organization.credentialId,
        },
        "crowdin external organization id backfilled from app jwt",
      );
    }
  }

  if (!organization.organizationSlug) {
    return { error: "organization_slug_missing" };
  }

  const [userConnection] = await db
    .select({
      userId: schema.crowdinUserConnections.userId,
      email: schema.users.email,
    })
    .from(schema.crowdinUserConnections)
    .innerJoin(schema.users, eq(schema.crowdinUserConnections.userId, schema.users.id))
    .where(
      and(
        eq(schema.crowdinUserConnections.organizationId, organization.organizationId),
        eq(schema.crowdinUserConnections.crowdinUserId, claims.crowdinUserId),
      ),
    )
    .limit(1);

  if (!userConnection) {
    return { error: "crowdin_user_not_linked" };
  }

  const projectId = encodeProviderProjectId({
    providerKind: "crowdin",
    externalProjectId: String(claims.crowdinProjectId),
  });

  const [project] = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.organizationId, organization.organizationId),
        eq(schema.projects.externalProviderKind, "crowdin"),
        eq(schema.projects.externalProjectId, String(claims.crowdinProjectId)),
      ),
    )
    .limit(1);

  if (!project) {
    return { error: "crowdin_project_not_linked" };
  }

  return {
    organizationId: organization.organizationId,
    organizationSlug: organization.organizationSlug,
    organizationName: organization.organizationName,
    userId: userConnection.userId,
    userEmail: userConnection.email,
    projectId: project.id || projectId,
    projectName: project.name,
    crowdinUserId: claims.crowdinUserId,
    crowdinOrganizationId: claims.crowdinOrganizationId,
    crowdinProjectId: claims.crowdinProjectId,
  };
}
