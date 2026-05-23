import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";
import { validateGlossaryTermsInTranslation } from "@/workflows/file-translation-job";

import {
  listOrganizationExternalTmsGlossaries,
  upsertOrganizationExternalTmsGlossary,
  upsertOrganizationExternalTmsGlossaryTerm,
} from "./organization-external-tms-glossaries";
import { upsertOrganizationExternalTmsProviderCredential } from "./organization-external-tms-provider-credentials";

describe("organizationExternalTmsGlossaries", () => {
  const createdRecordsByTest = new Map<
    string,
    { organizationIds: Set<string>; userIds: Set<string> }
  >();

  function currentTestKey() {
    return expect.getState().currentTestName ?? "__organization_external_tms_glossaries_default__";
  }

  function currentTestRecords() {
    const testKey = currentTestKey();
    const existing = createdRecordsByTest.get(testKey);

    if (existing) {
      return existing;
    }

    const records = {
      organizationIds: new Set<string>(),
      userIds: new Set<string>(),
    };
    createdRecordsByTest.set(testKey, records);

    return records;
  }

  async function createOrganizationUser() {
    const userId = randomUUID();
    const organizationId = randomUUID();
    const records = currentTestRecords();

    records.userIds.add(userId);
    records.organizationIds.add(organizationId);

    await db.insert(schema.users).values({
      id: userId,
      workosUserId: `user_${randomUUID()}`,
      email: `test-${userId}@example.com`,
    });
    await db.insert(schema.organizations).values({
      id: organizationId,
      workosOrganizationId: `org_${randomUUID()}`,
      slug: `org-${randomUUID().slice(0, 8)}`,
      name: "Acme",
    });
    await db.insert(schema.organizationMemberships).values({
      organizationId,
      userId,
      role: "owner",
    });

    return { organizationId, userId };
  }

  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    const testKey = currentTestKey();
    const records = createdRecordsByTest.get(testKey);

    if (!records) {
      return;
    }

    const organizationIds = [...records.organizationIds];
    const userIds = [...records.userIds];

    if (organizationIds.length > 0) {
      await db
        .delete(schema.glossaries)
        .where(inArray(schema.glossaries.organizationId, organizationIds));
      await db
        .delete(schema.organizationExternalTmsProviderCredentials)
        .where(
          inArray(
            schema.organizationExternalTmsProviderCredentials.organizationId,
            organizationIds,
          ),
        );
      await db
        .delete(schema.organizationMemberships)
        .where(inArray(schema.organizationMemberships.organizationId, organizationIds));
      await db
        .delete(schema.organizations)
        .where(inArray(schema.organizations.id, organizationIds));
    }

    if (userIds.length > 0) {
      await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    }

    createdRecordsByTest.delete(testKey);
  });

  it("upserts provider glossaries and terms without duplication", async () => {
    const { organizationId, userId } = await createOrganizationUser();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "owner",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-token",
    });

    const created = await upsertOrganizationExternalTmsGlossary({
      organizationId,
      providerCredentialId: credential.id,
      providerKind: "crowdin",
      externalProjectId: "crowdin-project-1",
      externalResourceType: "glossary",
      externalGlossaryId: "glossary-77",
      name: "Product Glossary",
      sourceLocale: "en",
      targetLocale: "fr",
      localeCoverage: ["en", "fr"],
      termCount: 12,
      externalUrl: "https://crowdin.com/glossary/77",
      metadata: { providerId: 77 },
    });

    expect(created.source).toBe("external_tms");
    expect(created.syncState).toBe("synced");

    const updated = await upsertOrganizationExternalTmsGlossary({
      organizationId,
      providerCredentialId: credential.id,
      providerKind: "crowdin",
      externalProjectId: "crowdin-project-1",
      externalResourceType: "glossary",
      externalGlossaryId: "glossary-77",
      name: "Product Glossary (updated)",
      sourceLocale: "en",
      targetLocale: "fr",
      localeCoverage: ["en", "fr", "de"],
      termCount: 15,
      syncState: "stale",
      metadata: { providerId: 77, revision: 2 },
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("Product Glossary (updated)");
    expect(updated.termCount).toBe(15);
    expect(updated.syncState).toBe("stale");

    const preferred = await upsertOrganizationExternalTmsGlossaryTerm({
      glossaryId: created.id,
      externalKey: "concept-9:fr",
      sourceTerm: "checkout",
      targetTerm: "paiement",
      status: "preferred",
      notes: "Button label",
    });
    const forbidden = await upsertOrganizationExternalTmsGlossaryTerm({
      glossaryId: created.id,
      externalKey: "concept-10:fr",
      sourceTerm: "smart routing",
      targetTerm: "smart routing",
      status: "forbidden",
    });

    expect(preferred.forbidden).toBe(false);
    expect(forbidden.forbidden).toBe(true);

    const preferredAgain = await upsertOrganizationExternalTmsGlossaryTerm({
      glossaryId: created.id,
      externalKey: "concept-9:fr",
      sourceTerm: "checkout",
      targetTerm: "passer au paiement",
      status: "preferred",
    });

    expect(preferredAgain.id).toBe(preferred.id);
    expect(preferredAgain.targetTerm).toBe("passer au paiement");

    const rows = await db
      .select()
      .from(schema.glossaryTerms)
      .where(eq(schema.glossaryTerms.glossaryId, created.id));
    expect(rows).toHaveLength(2);

    const listed = await listOrganizationExternalTmsGlossaries({
      organizationId,
      providerKind: "crowdin",
      externalProjectId: "crowdin-project-1",
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);
  });

  it("feeds normalized provider terms into glossary violation checks", async () => {
    const failures = validateGlossaryTermsInTranslation({
      sourceText: "Use checkout and avoid smart routing.",
      translatedText: "Utilisez checkout et smart routing.",
      terms: [
        {
          sourceTerm: "checkout",
          targetTerm: "paiement",
          targetLocale: "fr-FR",
          forbidden: false,
          caseSensitive: false,
        },
        {
          sourceTerm: "smart routing",
          targetTerm: "smart routing",
          targetLocale: "fr-FR",
          forbidden: true,
          caseSensitive: false,
        },
      ],
    });

    expect(failures).toEqual([
      {
        sourceTerm: "checkout",
        targetTerm: "paiement",
        forbidden: false,
        reason: "missing_preferred_term",
      },
      {
        sourceTerm: "smart routing",
        targetTerm: "smart routing",
        forbidden: true,
        reason: "contains_forbidden_term",
      },
    ]);
  });
});
