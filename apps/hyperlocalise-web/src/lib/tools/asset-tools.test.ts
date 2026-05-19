import "dotenv/config";

import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/hyperlocalise_test";
});

import { db, schema } from "@/lib/database";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

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
}) {
  const [glossary] = await db
    .insert(schema.glossaries)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      description: "",
      sourceLocale: "en",
      targetLocale: "fr",
      status: "active",
    })
    .returning();

  const [term] = await db
    .insert(schema.glossaryTerms)
    .values({
      glossaryId: glossary.id,
      sourceTerm: input.sourceTerm,
      targetTerm: input.targetTerm,
      description: "",
    })
    .returning();

  return { glossary, term };
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
    membershipRole: "admin" as const,
    projectId: null,
    db,
  };
}

async function executeGlossarySearch(input: {
  organizationId: string;
  sourceText: string;
  projectId?: string;
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
      limit: 10,
    },
    { toolCallId: "test-tool-call", messages: [] },
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
    { toolCallId: "test-tool-call", messages: [] },
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
