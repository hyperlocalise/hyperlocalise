import "dotenv/config";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { resolveWorkspaceKnowledgeFlagMock } = vi.hoisted(() => ({
  resolveWorkspaceKnowledgeFlagMock: vi.fn(async () => true),
}));

vi.mock("@/lib/flags/workspace-flags", () => ({
  resolveWorkspaceKnowledgeFlag: resolveWorkspaceKnowledgeFlagMock,
}));

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";
import { assembleStringTranslationContextSnapshot } from "@/lib/translation/context";

const fixture = createProjectTestFixture();

const longKnowledgeMemory = [
  "# Memory.md",
  "",
  "## Locale notes",
  "",
  "### en-AU",
  "",
  "Use Australian English for customer-facing copy.",
  "",
  "- Prefer colour, customise, localise, organise.",
  "- Avoid US spelling.",
  "",
  "### fr-FR",
  "",
  "French marketing and pricing copy should sound natural, not directly translated.",
  "",
  "- Avoid literal launch slogans.",
  "- Prefer idiomatic French marketing phrasing.",
  "",
  ...Array.from(
    { length: 80 },
    (_, index) => `- General filler ${index + 1}: keep unrelated support text concise.`,
  ),
].join("\n");

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  resolveWorkspaceKnowledgeFlagMock.mockResolvedValue(true);
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

  it("selects relevant workspace knowledge memory for large markdown notes", async () => {
    const { organization, user, project } = await fixture.createStoredProjectFixture();
    await db.insert(schema.knowledgeMemories).values({
      organizationId: organization.id,
      updatedByUserId: user.id,
      content: longKnowledgeMemory,
    });

    const result = await assembleStringTranslationContextSnapshot(project.id, {
      sourceLocale: "en-US",
      targetLocales: ["en-AU"],
      sourceText: "Customize your color settings",
      context: "",
      metadata: {},
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.knowledgeMemory).toContain("Australian English");
      expect(result.snapshot.knowledgeMemory).toContain("colour");
      expect(result.snapshot.knowledgeMemory).toContain("customise");
      expect(result.snapshot.knowledgeMemory).not.toContain("fr-FR");
      expect(result.snapshot.knowledgeMemory?.length).toBeLessThan(longKnowledgeMemory.length);
    }
  });

  it("omits saved workspace knowledge memory when the feature flag is disabled", async () => {
    resolveWorkspaceKnowledgeFlagMock.mockResolvedValue(false);
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
      expect(result.snapshot.knowledgeMemory).toBeNull();
    }
  });
});
