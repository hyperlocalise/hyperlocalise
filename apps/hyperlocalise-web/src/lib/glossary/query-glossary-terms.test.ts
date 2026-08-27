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

import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/hyperlocalise_test";
});

import { db, schema } from "@/lib/database";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";

import { Glossary } from "./glossary";
import { NativeGlossary } from "./native-glossary";
import { queryNativeGlossaryTermCounts } from "./query-glossary-term-counts";
import {
  listGlossaryTermsForProject,
  resolveProjectGlossarySourceLocale,
} from "./query-glossary-terms";

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
      identifier: uniqueTestProjectIdentifier(),
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
      targetLocale: null,
      status: "active",
    })
    .returning();

  await db.insert(schema.projectGlossaries).values({
    organizationId: input.organizationId,
    projectId: input.projectId,
    glossaryId: glossary.id,
  });

  const [concept] = await db
    .insert(schema.glossaryConcepts)
    .values({
      glossaryId: glossary.id,
      primaryTerm: input.sourceTerm,
    })
    .returning();

  const [sourceTermRow] = await db
    .insert(schema.glossaryTerms)
    .values({
      glossaryId: glossary.id,
      conceptId: concept.id,
      locale: "en",
      term: input.sourceTerm,
      sourceTerm: input.sourceTerm,
      targetTerm: input.sourceTerm,
      description: "",
      provenance: "manual",
      reviewStatus: "approved",
    })
    .returning();

  await db.insert(schema.glossaryTerms).values({
    glossaryId: glossary.id,
    conceptId: concept.id,
    locale: "fr",
    term: input.targetTerm,
    sourceTerm: input.targetTerm,
    targetTerm: input.targetTerm,
    description: "",
    provenance: "manual",
    reviewStatus: "approved",
  });

  return { glossary, term: sourceTermRow, concept };
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

  it("ignores leftover term-based rows without a concept_id", async () => {
    const organization = await createOrganization();
    const project = await createProject(organization.id);

    await createAttachedGlossaryTerm({
      organizationId: organization.id,
      projectId: project.id,
      glossaryName: "Concept Glossary",
      sourceTerm: "checkout",
      targetTerm: "paiement",
    });

    const [glossary] = await db
      .select({ id: schema.glossaries.id })
      .from(schema.glossaries)
      .where(inArray(schema.glossaries.organizationId, [organization.id]))
      .limit(1);

    await db.insert(schema.glossaryTerms).values({
      glossaryId: glossary.id,
      sourceTerm: "legacy",
      targetTerm: "héritage",
      description: "",
      provenance: "manual",
      reviewStatus: "approved",
    });

    const terms = await listGlossaryTermsForProject({
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: "en",
      targetLocales: ["fr"],
    });

    expect(terms).toHaveLength(1);
    expect(terms[0]).toMatchObject({
      sourceTerm: "checkout",
      targetTerm: "paiement",
    });
  });

  it("pairs approved native concept terms by source and target locale", async () => {
    const organization = await createOrganization();
    const project = await createProject(organization.id);
    const [glossary] = await db
      .insert(schema.glossaries)
      .values({
        organizationId: organization.id,
        name: "Native Concept Glossary",
        description: "",
        sourceLocale: "en",
        targetLocale: null,
        status: "active",
      })
      .returning();

    await db.insert(schema.projectGlossaries).values({
      organizationId: organization.id,
      projectId: project.id,
      glossaryId: glossary.id,
    });

    const [concept] = await db
      .insert(schema.glossaryConcepts)
      .values({
        glossaryId: glossary.id,
        primaryTerm: "checkout",
      })
      .returning();

    await db.insert(schema.glossaryTerms).values([
      {
        glossaryId: glossary.id,
        conceptId: concept.id,
        locale: "en",
        term: "checkout",
        sourceTerm: "checkout",
        targetTerm: "checkout",
        reviewStatus: "approved",
      },
      {
        glossaryId: glossary.id,
        conceptId: concept.id,
        locale: "fr",
        term: "paiement",
        sourceTerm: "paiement",
        targetTerm: "paiement",
        reviewStatus: "approved",
      },
      {
        glossaryId: glossary.id,
        conceptId: concept.id,
        locale: "de",
        term: "zahlung",
        sourceTerm: "zahlung",
        targetTerm: "zahlung",
        reviewStatus: "approved",
      },
    ]);

    const terms = await listGlossaryTermsForProject({
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: "en",
      targetLocales: ["fr"],
    });

    expect(terms).toHaveLength(1);
    expect(terms[0]).toMatchObject({
      glossaryName: "Native Concept Glossary",
      sourceTerm: "checkout",
      targetTerm: "paiement",
      targetLocale: "fr",
    });
  });

  it("returns preferred targets and forbidden not_recommended alternatives", async () => {
    const organization = await createOrganization();
    const project = await createProject(organization.id);
    const [glossary] = await db
      .insert(schema.glossaries)
      .values({
        organizationId: organization.id,
        name: "Status Glossary",
        description: "",
        sourceLocale: "en",
        targetLocale: null,
        status: "active",
      })
      .returning();

    await db.insert(schema.projectGlossaries).values({
      organizationId: organization.id,
      projectId: project.id,
      glossaryId: glossary.id,
    });

    const [concept] = await db
      .insert(schema.glossaryConcepts)
      .values({
        glossaryId: glossary.id,
        primaryTerm: "checkout",
      })
      .returning();

    await db.insert(schema.glossaryTerms).values([
      {
        glossaryId: glossary.id,
        conceptId: concept.id,
        locale: "en",
        term: "checkout",
        sourceTerm: "checkout",
        targetTerm: "checkout",
        status: "preferred",
        reviewStatus: "approved",
      },
      {
        glossaryId: glossary.id,
        conceptId: concept.id,
        locale: "fr",
        term: "paiement",
        sourceTerm: "paiement",
        targetTerm: "paiement",
        status: "preferred",
        reviewStatus: "approved",
      },
      {
        glossaryId: glossary.id,
        conceptId: concept.id,
        locale: "fr",
        term: "caisse",
        sourceTerm: "caisse",
        targetTerm: "caisse",
        status: "not_recommended",
        reviewStatus: "approved",
      },
    ]);

    const terms = await listGlossaryTermsForProject({
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: "en",
      targetLocales: ["fr"],
    });

    expect(terms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceTerm: "checkout",
          targetTerm: "paiement",
          forbidden: false,
        }),
        expect.objectContaining({
          sourceTerm: "checkout",
          targetTerm: "caisse",
          forbidden: true,
        }),
      ]),
    );
    expect(terms).toHaveLength(2);
  });

  it("includes non-translatable concepts as source-to-source pairs", async () => {
    const organization = await createOrganization();
    const project = await createProject(organization.id);
    const [glossary] = await db
      .insert(schema.glossaries)
      .values({
        organizationId: organization.id,
        name: "Brand Glossary",
        description: "",
        sourceLocale: "en",
        targetLocale: null,
        status: "active",
      })
      .returning();

    await db.insert(schema.projectGlossaries).values({
      organizationId: organization.id,
      projectId: project.id,
      glossaryId: glossary.id,
    });

    const [concept] = await db
      .insert(schema.glossaryConcepts)
      .values({
        glossaryId: glossary.id,
        primaryTerm: "Hyperlocalise",
        translatable: false,
      })
      .returning();

    await db.insert(schema.glossaryTerms).values({
      glossaryId: glossary.id,
      conceptId: concept.id,
      locale: "en",
      term: "Hyperlocalise",
      sourceTerm: "Hyperlocalise",
      targetTerm: "Hyperlocalise",
      status: "preferred",
      reviewStatus: "approved",
    });

    const terms = await listGlossaryTermsForProject({
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: "en",
      targetLocales: ["fr"],
    });

    expect(terms).toEqual([
      expect.objectContaining({
        sourceTerm: "Hyperlocalise",
        targetTerm: "Hyperlocalise",
        targetLocale: "fr",
        forbidden: false,
      }),
    ]);
  });

  it("orders terms from higher-priority attached glossaries first", async () => {
    const organization = await createOrganization();
    const project = await createProject(organization.id);

    const [highPriorityGlossary, lowPriorityGlossary] = await db
      .insert(schema.glossaries)
      .values([
        {
          organizationId: organization.id,
          name: "High Priority Glossary",
          description: "",
          sourceLocale: "en",
          targetLocale: null,
          status: "active",
        },
        {
          organizationId: organization.id,
          name: "Low Priority Glossary",
          description: "",
          sourceLocale: "en",
          targetLocale: null,
          status: "active",
        },
      ])
      .returning();

    await db.insert(schema.projectGlossaries).values([
      {
        organizationId: organization.id,
        projectId: project.id,
        glossaryId: highPriorityGlossary.id,
        priority: 1,
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        glossaryId: lowPriorityGlossary.id,
        priority: 2,
      },
    ]);

    for (const [glossary, sourceTerm, targetTerm] of [
      [highPriorityGlossary, "alpha", "alpha-fr"],
      [lowPriorityGlossary, "zebra", "zebre"],
    ] as const) {
      const [concept] = await db
        .insert(schema.glossaryConcepts)
        .values({
          glossaryId: glossary.id,
          primaryTerm: sourceTerm,
        })
        .returning();

      await db.insert(schema.glossaryTerms).values([
        {
          glossaryId: glossary.id,
          conceptId: concept.id,
          locale: "en",
          term: sourceTerm,
          sourceTerm,
          targetTerm: sourceTerm,
          status: "preferred",
          reviewStatus: "approved",
        },
        {
          glossaryId: glossary.id,
          conceptId: concept.id,
          locale: "fr",
          term: targetTerm,
          sourceTerm: targetTerm,
          targetTerm,
          status: "preferred",
          reviewStatus: "approved",
        },
      ]);
    }

    const terms = await listGlossaryTermsForProject({
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: "en",
      targetLocales: ["fr"],
    });

    expect(terms.map((term) => term.glossaryId)).toEqual([
      highPriorityGlossary.id,
      lowPriorityGlossary.id,
    ]);
  });

  it("caps flattened pairs when maxPairs is provided", async () => {
    const organization = await createOrganization();
    const project = await createProject(organization.id);

    await createAttachedGlossaryTerm({
      organizationId: organization.id,
      projectId: project.id,
      glossaryName: "Alpha",
      sourceTerm: "alpha",
      targetTerm: "alpha-fr",
    });
    await createAttachedGlossaryTerm({
      organizationId: organization.id,
      projectId: project.id,
      glossaryName: "Beta",
      sourceTerm: "beta",
      targetTerm: "beta-fr",
    });

    const terms = await listGlossaryTermsForProject({
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: "en",
      targetLocales: ["fr"],
      maxPairs: 1,
    });

    expect(terms).toHaveLength(1);
  });
});

describe("resolveProjectGlossarySourceLocale", () => {
  it("falls back to the project source locale when provider content omits it", async () => {
    const organization = await createOrganization();
    const project = await createProject(organization.id);

    await db
      .update(schema.projects)
      .set({ sourceLocale: "de" })
      .where(inArray(schema.projects.id, [project.id]));

    await expect(
      resolveProjectGlossarySourceLocale({
        organizationId: organization.id,
        projectId: project.id,
        contentSourceLocale: null,
      }),
    ).resolves.toBe("de");
  });

  it("prefers the provider content source locale when present", async () => {
    const organization = await createOrganization();
    const project = await createProject(organization.id);

    await db
      .update(schema.projects)
      .set({ sourceLocale: "de" })
      .where(inArray(schema.projects.id, [project.id]));

    await expect(
      resolveProjectGlossarySourceLocale({
        organizationId: organization.id,
        projectId: project.id,
        contentSourceLocale: "en",
      }),
    ).resolves.toBe("en");
  });
});

describe("queryNativeGlossaryTermCounts", () => {
  it("counts only concept-linked glossary terms and returns zero for empty glossaries", async () => {
    const organization = await createOrganization();
    const [emptyGlossary, populatedGlossary] = await db
      .insert(schema.glossaries)
      .values([
        {
          organizationId: organization.id,
          name: "Empty glossary",
          description: "",
          sourceLocale: "en",
        },
        {
          organizationId: organization.id,
          name: "Populated glossary",
          description: "",
          sourceLocale: "en",
        },
      ])
      .returning();

    const [concept] = await db
      .insert(schema.glossaryConcepts)
      .values({
        glossaryId: populatedGlossary.id,
        primaryTerm: "checkout",
      })
      .returning();

    await db.insert(schema.glossaryTerms).values([
      {
        glossaryId: populatedGlossary.id,
        conceptId: concept.id,
        locale: "en",
        term: "checkout",
        sourceTerm: "checkout",
        targetTerm: "checkout",
        description: "",
        provenance: "manual",
        reviewStatus: "approved",
      },
      {
        glossaryId: populatedGlossary.id,
        conceptId: concept.id,
        locale: "fr",
        term: "caisse",
        sourceTerm: "caisse",
        targetTerm: "caisse",
        description: "",
        provenance: "manual",
        reviewStatus: "approved",
      },
      {
        glossaryId: populatedGlossary.id,
        sourceTerm: "legacy",
        targetTerm: "héritage",
        description: "",
        provenance: "manual",
        reviewStatus: "approved",
      },
    ]);

    const counts = await queryNativeGlossaryTermCounts([emptyGlossary, populatedGlossary]);

    expect(counts.get(emptyGlossary.id)).toBe(0);
    expect(counts.get(populatedGlossary.id)).toBe(2);
  });
});

describe("Glossary project counts", () => {
  it("counts native glossary projects with Drizzle", async () => {
    const organization = await createOrganization();
    const project = await createProject(organization.id);
    const [glossary] = await db
      .insert(schema.glossaries)
      .values({
        organizationId: organization.id,
        name: "Attached glossary",
        description: "",
        sourceLocale: "en",
        targetLocale: null,
        status: "active",
      })
      .returning();

    await db.insert(schema.projectGlossaries).values({
      organizationId: organization.id,
      projectId: project.id,
      glossaryId: glossary.id,
    });

    const product = new NativeGlossary({
      auth: { organization: { localOrganizationId: organization.id } } as never,
      glossary,
    });

    await expect(product.queryProjectCount()).resolves.toBe(1);
    await expect(Glossary.queryProjectCounts([product])).resolves.toEqual(
      new Map([[glossary.id, 1]]),
    );
  });
});
