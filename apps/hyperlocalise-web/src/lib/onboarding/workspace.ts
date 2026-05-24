import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { syncWorkosUser } from "@/api/auth/workos-sync";
import { db, schema } from "@/lib/database";
import { getWorkosServerClient } from "@/lib/workos/server-client";

function slugifyOrganizationName(name: string) {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "workspace";
}

function isUniqueViolation(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  if ("code" in error && error.code === "23505") {
    return true;
  }

  const cause = "cause" in error ? error.cause : undefined;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}

async function createUniqueOrganizationSlug(name: string, dbHandle: Pick<typeof db, "select">) {
  const baseSlug = slugifyOrganizationName(name);
  let attempt = 0;

  while (attempt < 100) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const [existingOrganization] = await dbHandle
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, candidate))
      .limit(1);

    if (!existingOrganization) {
      return candidate;
    }

    attempt += 1;
  }

  return `${baseSlug}-${randomUUID().slice(0, 8)}`;
}

async function deleteWorkosOrganization(workosOrganizationId: string) {
  const workos = getWorkosServerClient();
  if (!workos) {
    return;
  }

  try {
    await workos.organizations.deleteOrganization(workosOrganizationId);
  } catch {
    // Best-effort cleanup; preserve the original failure.
  }
}

async function createWorkspaceIdentityInWorkos(input: {
  localWorkspaceId: string;
  organizationName: string;
  workosUserId: string;
}) {
  const workos = getWorkosServerClient();

  if (!workos) {
    throw new Error("workos_organization_required");
  }

  let workosOrganizationId: string | undefined;

  try {
    const organization = await workos.organizations.createOrganization(
      {
        name: input.organizationName,
        externalId: input.localWorkspaceId,
        metadata: {
          hyperlocalise_local_organization_id: input.localWorkspaceId,
        },
      },
      { idempotencyKey: `workspace:${input.localWorkspaceId}` },
    );
    workosOrganizationId = organization.id;

    const membership = await workos.userManagement.createOrganizationMembership({
      organizationId: organization.id,
      userId: input.workosUserId,
      roleSlug: "owner",
    });

    return {
      workosOrganizationId: organization.id,
      workosMembershipId: membership.id,
    };
  } catch (error) {
    if (workosOrganizationId) {
      await deleteWorkosOrganization(workosOrganizationId);
    }

    throw error;
  }
}

export async function createWorkspaceForSessionUser(input: {
  sessionUser: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    profilePictureUrl?: string | null;
  };
  organizationName: string;
}) {
  const user = await syncWorkosUser(db, {
    workosUserId: input.sessionUser.id,
    email: input.sessionUser.email,
    firstName: input.sessionUser.firstName ?? undefined,
    lastName: input.sessionUser.lastName ?? undefined,
    avatarUrl: input.sessionUser.profilePictureUrl ?? undefined,
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const localWorkspaceId = randomUUID();
    let workosOrganizationId: string | undefined;

    try {
      const identity = await createWorkspaceIdentityInWorkos({
        localWorkspaceId,
        organizationName: input.organizationName.trim(),
        workosUserId: input.sessionUser.id,
      });
      workosOrganizationId = identity.workosOrganizationId;

      return await db.transaction(async (tx) => {
        const slug = await createUniqueOrganizationSlug(input.organizationName, tx);

        const [organization] = await tx
          .insert(schema.organizations)
          .values({
            id: localWorkspaceId,
            workosOrganizationId: identity.workosOrganizationId,
            name: input.organizationName.trim(),
            slug,
          })
          .returning({
            id: schema.organizations.id,
            name: schema.organizations.name,
            slug: schema.organizations.slug,
          });

        await tx.insert(schema.organizationMemberships).values({
          organizationId: organization.id,
          userId: user.id,
          role: "owner",
          workosMembershipId: identity.workosMembershipId,
        });

        return {
          user,
          organization,
        };
      });
    } catch (error) {
      if (workosOrganizationId) {
        await deleteWorkosOrganization(workosOrganizationId);
      }

      if (isUniqueViolation(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("workspace_slug_conflict");
}
