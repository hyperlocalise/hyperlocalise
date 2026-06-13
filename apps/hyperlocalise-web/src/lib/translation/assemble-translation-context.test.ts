import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";
import { assembleStringTranslationContextSnapshot } from "@/lib/translation/assemble-translation-context";

const fixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

describe("assembleStringTranslationContextSnapshot", () => {
  it("includes saved workspace knowledge memory in the translation context", async () => {
    const { organization, user, project } = await fixture.createStoredProjectFixture();
    await db.insert(schema.knowledgeMemories).values({
      organizationId: organization.id,
      updatedByUserId: user.id,
      content: "Always refer to Hyperlocalise as the product name.",
    });

    const result = await assembleStringTranslationContextSnapshot(project.id, {
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      sourceText: "Welcome to Hyperlocalise",
      context: "",
      metadata: {},
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.knowledgeMemory).toBe(
        "Always refer to Hyperlocalise as the product name.",
      );
    }
  });
});
