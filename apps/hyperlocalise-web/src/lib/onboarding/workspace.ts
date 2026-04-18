import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { syncWorkosUser } from "@/api/auth/workos-sync";
import { db, schema } from "@/lib/database";

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
    try {
      return await db.transaction(async (tx) => {
        const slug = await createUniqueOrganizationSlug(input.organizationName, tx);

        const [organization] = await tx
          .insert(schema.organizations)
          .values({
            workosOrganizationId: `local_org_${randomUUID()}`,
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
          workosMembershipId: null,
        });

        return {
          user,
          organization,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("workspace_slug_conflict");
}
