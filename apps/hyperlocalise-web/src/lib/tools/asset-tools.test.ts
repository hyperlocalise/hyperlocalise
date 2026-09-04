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

import { db, schema } from "@/lib/database/client";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";

import { createQueryGlossaryTool, createQueryTranslationMemoryTool } from "./asset-tools";

const createdOrganizationIds = new Set<string>();

type GlossarySearchResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof createQueryGlossaryTool>["execute"]>>
>;

type MemorySearchResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof createQueryTranslationMemoryTool>["execute"]>>
>;

async function createOrganization() {
  const suffix = randomUUID();
  const workosOrganizationId = `org_${suffix}`;

  const [organization] = await db
    .insert(schema.organizations)
    .values({
      workosOrganizationId,
      name: `Asset Tool Org ${suffix}`,
      slug: `asset-tool-org-${suffix}`,
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

async function createGlossaryWithTerm(input: {
  organizationId: string;
  name: string;
  sourceTerm: string;
  targetTerm: string;
  targetStatus?: string;
  description?: string;
  caseSensitive?: boolean;
  targetForbidden?: boolean;
}) {
  const [glossary] = await db
    .insert(schema.glossaries)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      description: "",
      sourceLocale: "en",
      targetLocale: null,
      status: "active",
    })
    .returning();

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
      description: input.description ?? "",
      caseSensitive: input.caseSensitive ?? false,
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
    status: input.targetStatus ?? "preferred",
    forbidden: input.targetForbidden ?? false,
    reviewStatus: "approved",
  });

  return { glossary, term: sourceTermRow, concept };
}

async function createMemoryWithEntry(input: {
  organizationId: string;
  name: string;
  sourceText: string;
  targetText: string;
}) {
  const [memory] = await db
    .insert(schema.memories)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      description: "",
      status: "active",
    })
    .returning();

  const [entry] = await db
    .insert(schema.memoryEntries)
    .values({
      memoryId: memory.id,
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: input.sourceText,
      normalizedSourceText: normalizeTranslationMemorySourceText(input.sourceText),
      targetText: input.targetText,
      matchScore: 100,
      provenance: "manual",
      reviewStatus: "approved",
    })
    .returning();

  return { memory, entry };
}

function toolContext(organizationId: string) {
  return {
    conversationId: randomUUID(),
    organizationId,
    localUserId: "user_test",
    membershipRole: "admin" as const,
    projectId: null,
    db,
  };
}

async function executeGlossarySearch(input: {
  organizationId: string;
  sourceText: string;
  projectId?: string;
  glossaryId?: string;
}): Promise<Extract<GlossarySearchResult, { terms: unknown }>> {
  const queryGlossary = createQueryGlossaryTool(toolContext(input.organizationId));

  if (!queryGlossary.execute) {
    throw new Error("query glossary tool is missing execute");
  }

  const result = await queryGlossary.execute(
    {
      sourceText: input.sourceText,
      sourceLocale: "en",
      targetLocale: "fr",
      projectId: input.projectId,
      glossaryId: input.glossaryId,
      limit: 10,
    },
    { toolCallId: "test-tool-call", messages: [], context: {} },
  );

  return result as Extract<GlossarySearchResult, { terms: unknown }>;
}

async function executeMemorySearch(input: {
  organizationId: string;
  sourceText: string;
  projectId?: string;
}): Promise<Extract<MemorySearchResult, { matches: unknown }>> {
  const queryMemory = createQueryTranslationMemoryTool(toolContext(input.organizationId));

  if (!queryMemory.execute) {
    throw new Error("query translation memory tool is missing execute");
  }

  const result = await queryMemory.execute(
    {
      sourceText: input.sourceText,
      sourceLocale: "en",
      targetLocale: "fr",
      projectId: input.projectId,
      limit: 10,
    },
    { toolCallId: "test-tool-call", messages: [], context: {} },
  );

  return result as Extract<MemorySearchResult, { matches: unknown }>;
}

afterEach(async () => {
  const organizationIds = [...createdOrganizationIds];
  if (organizationIds.length === 0) {
    return;
  }

  const glossaries = await db
    .select({ id: schema.glossaries.id })
    .from(schema.glossaries)
    .where(inArray(schema.glossaries.organizationId, organizationIds));
  const memories = await db
    .select({ id: schema.memories.id })
    .from(schema.memories)
    .where(inArray(schema.memories.organizationId, organizationIds));

  await db
    .delete(schema.projectGlossaries)
    .where(inArray(schema.projectGlossaries.organizationId, organizationIds));
  await db
    .delete(schema.projectMemories)
    .where(inArray(schema.projectMemories.organizationId, organizationIds));

  const glossaryIds = glossaries.map((glossary) => glossary.id);
  if (glossaryIds.length > 0) {
    await db
      .delete(schema.glossaryTerms)
      .where(inArray(schema.glossaryTerms.glossaryId, glossaryIds));
    await db
      .delete(schema.glossaryConcepts)
      .where(inArray(schema.glossaryConcepts.glossaryId, glossaryIds));
  }

  const memoryIds = memories.map((memory) => memory.id);
  if (memoryIds.length > 0) {
    await db.delete(schema.memoryEntries).where(inArray(schema.memoryEntries.memoryId, memoryIds));
  }

  await db.delete(schema.projects).where(inArray(schema.projects.organizationId, organizationIds));
  await db
    .delete(schema.glossaries)
    .where(inArray(schema.glossaries.organizationId, organizationIds));
  await db.delete(schema.memories).where(inArray(schema.memories.organizationId, organizationIds));
  await db.delete(schema.organizations).where(inArray(schema.organizations.id, organizationIds));

  createdOrganizationIds.clear();
});

describe("createQueryGlossaryTool", () => {
  it("does not return glossary terms from another organization", async () => {
    const currentOrganization = await createOrganization();
    const otherOrganization = await createOrganization();

    await createGlossaryWithTerm({
      organizationId: currentOrganization.id,
      name: "Current Glossary",
      sourceTerm: "checkout",
      targetTerm: "paiement",
    });
    await createGlossaryWithTerm({
      organizationId: otherOrganization.id,
      name: "Other Glossary",
      sourceTerm: "checkout",
      targetTerm: "caisse",
    });

    const result = await executeGlossarySearch({
      organizationId: currentOrganization.id,
      sourceText: "checkout",
    });

    expect(result.terms).toHaveLength(1);
    expect(result.terms[0]).toMatchObject({
      glossaryName: "Current Glossary",
      sourceTerm: "checkout",
      targetTerm: "paiement",
    });
  });

  it("does not use a project ID from another organization to read attached glossaries", async () => {
    const currentOrganization = await createOrganization();
    const otherOrganization = await createOrganization();
    const otherProject = await createProject(otherOrganization.id);
    const { glossary } = await createGlossaryWithTerm({
      organizationId: otherOrganization.id,
      name: "Other Project Glossary",
      sourceTerm: "checkout",
      targetTerm: "caisse",
    });

    await db.insert(schema.projectGlossaries).values({
      organizationId: otherOrganization.id,
      projectId: otherProject.id,
      glossaryId: glossary.id,
    });

    const result = await executeGlossarySearch({
      organizationId: currentOrganization.id,
      sourceText: "checkout",
      projectId: otherProject.id,
    });

    expect(result.terms).toEqual([]);
  });

  it("returns non-translatable concepts as source-to-source matches", async () => {
    const organization = await createOrganization();

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

    const result = await executeGlossarySearch({
      organizationId: organization.id,
      sourceText: "Hyperlocalise",
    });

    expect(result.terms).toEqual([
      expect.objectContaining({
        sourceTerm: "Hyperlocalise",
        targetTerm: "Hyperlocalise",
        glossaryName: "Brand Glossary",
      }),
    ]);
  });

  it("returns no terms for an empty query", async () => {
    const organization = await createOrganization();
    await createGlossaryWithTerm({
      organizationId: organization.id,
      name: "Commerce",
      sourceTerm: "checkout",
      targetTerm: "paiement",
    });

    const result = await executeGlossarySearch({
      organizationId: organization.id,
      sourceText: "   &&&   ",
    });

    expect(result.terms).toEqual([]);
  });

  it("marks forbidden target terms so callers can avoid them", async () => {
    const organization = await createOrganization();
    await createGlossaryWithTerm({
      organizationId: organization.id,
      name: "Commerce",
      sourceTerm: "checkout",
      targetTerm: "caisse",
      targetStatus: "not_recommended",
    });

    const result = await executeGlossarySearch({
      organizationId: organization.id,
      sourceText: "checkout",
    });

    expect(result.terms).toEqual([
      expect.objectContaining({
        sourceTerm: "checkout",
        targetTerm: "caisse",
        forbidden: true,
        status: "not_recommended",
      }),
    ]);
  });

  it("does not search an unlinked glossary when a project ID is set", async () => {
    const organization = await createOrganization();
    const project = await createProject(organization.id);
    const linked = await createGlossaryWithTerm({
      organizationId: organization.id,
      name: "Linked Glossary",
      sourceTerm: "checkout",
      targetTerm: "paiement",
    });
    await createGlossaryWithTerm({
      organizationId: organization.id,
      name: "Unlinked Glossary",
      sourceTerm: "checkout",
      targetTerm: "caisse",
    });

    await db.insert(schema.projectGlossaries).values({
      organizationId: organization.id,
      projectId: project.id,
      glossaryId: linked.glossary.id,
    });

    const result = await executeGlossarySearch({
      organizationId: organization.id,
      sourceText: "checkout",
      projectId: project.id,
    });

    expect(result.terms).toEqual([
      expect.objectContaining({
        glossaryId: linked.glossary.id,
        targetTerm: "paiement",
      }),
    ]);
  });

  it("does not return leftover term-based rows without a concept", async () => {
    const organization = await createOrganization();
    const { glossary } = await createGlossaryWithTerm({
      organizationId: organization.id,
      name: "Commerce",
      sourceTerm: "invoice",
      targetTerm: "facture",
    });

    await db.insert(schema.glossaryTerms).values({
      glossaryId: glossary.id,
      conceptId: null,
      locale: null,
      term: null,
      sourceTerm: "checkout",
      targetTerm: "caisse-legacy",
      description: "",
      reviewStatus: "approved",
    });

    const result = await executeGlossarySearch({
      organizationId: organization.id,
      sourceText: "checkout",
    });

    expect(result.terms).toEqual([]);
  });

  it("returns no terms for an inaccessible glossary ID", async () => {
    const currentOrganization = await createOrganization();
    const otherOrganization = await createOrganization();
    const { glossary } = await createGlossaryWithTerm({
      organizationId: otherOrganization.id,
      name: "Other Glossary",
      sourceTerm: "checkout",
      targetTerm: "caisse",
    });

    const result = await executeGlossarySearch({
      organizationId: currentOrganization.id,
      sourceText: "checkout",
      glossaryId: glossary.id,
    });

    expect(result.terms).toEqual([]);
  });

  it("matches a glossary term contained in a longer source string", async () => {
    const organization = await createOrganization();
    await createGlossaryWithTerm({
      organizationId: organization.id,
      name: "Commerce",
      sourceTerm: "checkout",
      targetTerm: "paiement",
    });

    const result = await executeGlossarySearch({
      organizationId: organization.id,
      sourceText: "Proceed to checkout",
    });

    expect(result.terms).toEqual([
      expect.objectContaining({
        sourceTerm: "checkout",
        targetTerm: "paiement",
      }),
    ]);
  });

  it("does not return a case-sensitive term for a differently cased query", async () => {
    const organization = await createOrganization();
    await createGlossaryWithTerm({
      organizationId: organization.id,
      name: "Brand",
      sourceTerm: "NASA",
      targetTerm: "NASA",
      caseSensitive: true,
    });

    const missed = await executeGlossarySearch({
      organizationId: organization.id,
      sourceText: "nasa",
    });
    const matched = await executeGlossarySearch({
      organizationId: organization.id,
      sourceText: "NASA launches today",
    });

    expect(missed.terms).toEqual([]);
    expect(matched.terms).toEqual([
      expect.objectContaining({
        sourceTerm: "NASA",
        caseSensitive: true,
      }),
    ]);
  });

  it("marks an explicit forbidden flag even when status is preferred", async () => {
    const organization = await createOrganization();
    await createGlossaryWithTerm({
      organizationId: organization.id,
      name: "Commerce",
      sourceTerm: "checkout",
      targetTerm: "caisse",
      targetForbidden: true,
    });

    const result = await executeGlossarySearch({
      organizationId: organization.id,
      sourceText: "checkout",
    });

    expect(result.terms).toEqual([
      expect.objectContaining({
        targetTerm: "caisse",
        forbidden: true,
        status: "preferred",
      }),
    ]);
  });

  it("returns no terms for a non-UUID or provider glossary ID", async () => {
    const organization = await createOrganization();
    await createGlossaryWithTerm({
      organizationId: organization.id,
      name: "Commerce",
      sourceTerm: "checkout",
      targetTerm: "paiement",
    });

    const missing = await executeGlossarySearch({
      organizationId: organization.id,
      sourceText: "checkout",
      glossaryId: "missing",
    });
    const provider = await executeGlossarySearch({
      organizationId: organization.id,
      sourceText: "checkout",
      glossaryId: "crowdin:glossary:42",
    });

    expect(missing.terms).toEqual([]);
    expect(provider.terms).toEqual([]);
  });
});

describe("createQueryTranslationMemoryTool", () => {
  it("does not return memory entries from another organization", async () => {
    const currentOrganization = await createOrganization();
    const otherOrganization = await createOrganization();

    await createMemoryWithEntry({
      organizationId: currentOrganization.id,
      name: "Current Memory",
      sourceText: "Start checkout",
      targetText: "Commencer le paiement",
    });
    await createMemoryWithEntry({
      organizationId: otherOrganization.id,
      name: "Other Memory",
      sourceText: "Start checkout",
      targetText: "Commencer la caisse",
    });

    const result = await executeMemorySearch({
      organizationId: currentOrganization.id,
      sourceText: "Start checkout",
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      sourceText: "Start checkout",
      targetText: "Commencer le paiement",
    });
  });

  it("does not return fuzzy memory matches from another organization", async () => {
    const currentOrganization = await createOrganization();
    const otherOrganization = await createOrganization();

    await createMemoryWithEntry({
      organizationId: currentOrganization.id,
      name: "Current Fuzzy Memory",
      sourceText: "Start checkout",
      targetText: "Commencer le paiement",
    });
    await createMemoryWithEntry({
      organizationId: otherOrganization.id,
      name: "Other Fuzzy Memory",
      sourceText: "Start checkout",
      targetText: "Commencer la caisse",
    });

    const result = await executeMemorySearch({
      organizationId: currentOrganization.id,
      sourceText: "checkout",
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      sourceText: "Start checkout",
      targetText: "Commencer le paiement",
    });
  });

  it("does not use a project ID from another organization to read attached memories", async () => {
    const currentOrganization = await createOrganization();
    const otherOrganization = await createOrganization();
    const otherProject = await createProject(otherOrganization.id);
    const { memory } = await createMemoryWithEntry({
      organizationId: otherOrganization.id,
      name: "Other Project Memory",
      sourceText: "Start checkout",
      targetText: "Commencer la caisse",
    });

    await db.insert(schema.projectMemories).values({
      organizationId: otherOrganization.id,
      projectId: otherProject.id,
      memoryId: memory.id,
    });

    const result = await executeMemorySearch({
      organizationId: currentOrganization.id,
      sourceText: "Start checkout",
      projectId: otherProject.id,
    });

    expect(result.matches).toEqual([]);
  });
});
