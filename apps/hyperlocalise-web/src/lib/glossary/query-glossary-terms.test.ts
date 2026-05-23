import "dotenv/config";

import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/hyperlocalise_test";
});

import { db, schema } from "@/lib/database";

import { listGlossaryTermsForProject } from "./query-glossary-terms";

const createdOrganizationIds = new Set<string>();

async function createOrganization() {
  const suffix = randomUUID();
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      workosOrganizationId: `org_${suffix}`,
      name: `Glossary Query Org ${suffix}`,
      slug: `glossary-query-org-${suffix}`,
    })
    .returning();

  createdOrganizationIds.add(organization.id);
  return organization;
}

async function createProject(organizationId: string) {
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      organizationId,
      name: "Launch Site",
      description: "",
      translationContext: "",
    })
    .returning();

  return project;
}

async function createAttachedGlossaryTerm(input: {
  organizationId: string;
  projectId: string;
  glossaryName: string;
  sourceTerm: string;
  targetTerm: string;
}) {
  const [glossary] = await db
    .insert(schema.glossaries)
    .values({
      organizationId: input.organizationId,
      name: input.glossaryName,
      description: "",
      sourceLocale: "en",
      targetLocale: "fr",
      status: "active",
    })
    .returning();

  await db.insert(schema.projectGlossaries).values({
    organizationId: input.organizationId,
    projectId: input.projectId,
    glossaryId: glossary.id,
  });

  const [term] = await db
    .insert(schema.glossaryTerms)
    .values({
      glossaryId: glossary.id,
      sourceTerm: input.sourceTerm,
      targetTerm: input.targetTerm,
      description: "",
      provenance: "manual",
      reviewStatus: "approved",
    })
    .returning();

  return { glossary, term };
}

afterEach(async () => {
  const organizationIds = [...createdOrganizationIds];
  if (organizationIds.length === 0) {
    return;
  }

  await db.delete(schema.organizations).where(inArray(schema.organizations.id, organizationIds));
  createdOrganizationIds.clear();
});

describe("listGlossaryTermsForProject", () => {
  it("does not use another organization's project ID to discover glossary terms", async () => {
    const currentOrganization = await createOrganization();
    const otherOrganization = await createOrganization();
    const otherProject = await createProject(otherOrganization.id);

    await createAttachedGlossaryTerm({
      organizationId: otherOrganization.id,
      projectId: otherProject.id,
      glossaryName: "Other Org Glossary",
      sourceTerm: "checkout",
      targetTerm: "caisse",
    });

    const terms = await listGlossaryTermsForProject({
      organizationId: currentOrganization.id,
      projectId: otherProject.id,
      sourceLocale: "en",
      targetLocales: ["fr"],
    });

    expect(terms).toEqual([]);
  });

  it("returns approved terms from the requested organization's attached glossaries", async () => {
    const organization = await createOrganization();
    const project = await createProject(organization.id);

    await createAttachedGlossaryTerm({
      organizationId: organization.id,
      projectId: project.id,
      glossaryName: "Current Org Glossary",
      sourceTerm: "checkout",
      targetTerm: "paiement",
    });

    const terms = await listGlossaryTermsForProject({
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: "en",
      targetLocales: ["fr"],
    });

    expect(terms).toHaveLength(1);
    expect(terms[0]).toMatchObject({
      glossaryName: "Current Org Glossary",
      sourceTerm: "checkout",
      targetTerm: "paiement",
      targetLocale: "fr",
    });
  });
});
